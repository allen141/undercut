import { createHash, randomBytes } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { and, desc, eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { campaignInputSchema, commandRequestSchema } from '@undercut/contracts';
import { applyCommand, newGame, RuleError, upgradeState } from '@undercut/game-core';
import { auth, origin, redeemInvitation } from './auth.js';
import { db } from './db.js';
import { campaigns, receipts } from './schema.js';

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const campaignIdSchema = z.uuid();
const createCampaignSchema = campaignInputSchema.extend({ id: campaignIdSchema });
const campaignParamsSchema = z.object({ id: campaignIdSchema });

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : {
      serializers: {
        req: (request) => {
          const path = request.url?.split('?')[0];
          return { method: request.method, url: path?.startsWith('/api/auth/') ? '/api/auth/*' : path };
        },
      },
    },
    trustProxy: (_address, hop) => hop < 2,
    bodyLimit: 32768,
  });

  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!safeMethods.has(request.method) && request.headers.origin !== origin) {
      throw new HttpError(403, 'Request origin is not allowed.');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error instanceof ZodError ? 400
      : error instanceof RuleError ? 422
      : (error as Error & { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error({ errorName: (error as Error).name }, 'Request failed');
    reply.code(status).send({
      error: status >= 500 ? 'The server could not complete this action. Please retry.' : (error as Error).message,
    });
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: { rateLimit: { max: 25, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const url = new URL(request.url, origin);
      const authRequest = new Request(url, {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
      });
      const response = request.method === 'POST' && url.pathname === '/api/auth/sign-up/email'
        ? await redeemInvitation(authRequest, request.body)
        : await auth.handler(authRequest);

      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });

  app.get('/api/v1/health/live', async () => ({ ok: true }));
  app.get('/api/v1/health/ready', async () => {
    await db.execute(sql`select 1 from campaigns limit 1`);
    return { ok: true };
  });
  app.get('/api/v1/health/version', async () => ({
    commit: process.env.BUILD_VERSION ?? 'local',
    pullRequest: process.env.BUILD_PR_NUMBER ?? null,
  }));

  async function owner(headers: Parameters<typeof fromNodeHeaders>[0]) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) throw new HttpError(401, 'Please sign in.');
    return session.user.id;
  }

  app.get('/api/v1/campaigns', async (request) => {
    const userId = await owner(request.headers);
    return db.select({
      id: campaigns.id,
      name: campaigns.name,
      revision: campaigns.revision,
      updatedAt: campaigns.updatedAt,
    }).from(campaigns)
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.updatedAt));
  });

  app.post('/api/v1/campaigns', async (request) => {
    const userId = await owner(request.headers);
    const { id, name } = createCampaignSchema.parse(request.body);
    await db.insert(campaigns).values({
      id, userId, name, state: newGame(randomBytes(4).readUInt32BE()),
    }).onConflictDoNothing();

    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
    if (!campaign || campaign.name !== name) throw new HttpError(409, 'Campaign creation identifier already used.');
    return campaign;
  });

  app.get('/api/v1/campaigns/:id', async (request) => {
    const userId = await owner(request.headers);
    const { id } = campaignParamsSchema.parse(request.params);
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
    if (!campaign) throw new HttpError(404, 'Campaign not found.');
    return { ...campaign, state: upgradeState(campaign.state) };
  });

  app.post('/api/v1/campaigns/:id/commands', async (request) => {
    const userId = await owner(request.headers);
    const { id } = campaignParamsSchema.parse(request.params);
    const input = commandRequestSchema.parse(request.body);
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');

    return db.transaction(async (tx) => {
      const [campaign] = await tx.select().from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
        .for('update');
      if (!campaign) throw new HttpError(404, 'Campaign not found.');

      const [receipt] = await tx.select({ requestHash: receipts.requestHash }).from(receipts)
        .where(and(eq(receipts.campaignId, id), eq(receipts.actionId, input.actionId)));
      if (receipt) {
        if (receipt.requestHash !== requestHash) {
          throw new HttpError(409, 'This action identifier was already used for a different request.');
        }
        return campaign;
      }
      if (campaign.revision !== input.expectedRevision) {
        throw new HttpError(409, 'This campaign changed on another device. Refresh to continue.');
      }

      const state = applyCommand(campaign.state, input.command);
      const revision = campaign.revision + 1;
      const [updated] = await tx.update(campaigns)
        .set({ state, revision, updatedAt: new Date() })
        .where(eq(campaigns.id, id))
        .returning();

      await tx.insert(receipts).values({
        campaignId: id,
        actionId: input.actionId,
        requestHash,
        response: { revision },
      });
      return updated;
    });
  });

  return app;
}
