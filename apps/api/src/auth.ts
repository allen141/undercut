import { createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db.js';
import * as schema from './schema.js';

export const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:5173').origin;
const secret = process.env.BETTER_AUTH_SECRET ?? '';
if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuthOptions = {
  allowSignUp?: boolean;
  emitResetLink?: (link: string) => void;
};

export function createAuth(database: typeof db | Transaction, options: AuthOptions = {}) {
  return betterAuth({
    baseURL: origin,
    secret,
    database: drizzleAdapter(database, { provider: 'pg', schema, transaction: true }),
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    verification: { storeIdentifier: 'hashed' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      minPasswordLength: 12,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ token }) => {
        const link = new URL('/reset', origin);
        link.hash = new URLSearchParams({ token }).toString();
        options.emitResetLink?.(link.href);
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: { cookiePrefix: 'undercut', useSecureCookies: origin.startsWith('https:') },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/request-password-reset' && !options.emitResetLink) {
          throw new APIError('FORBIDDEN', { message: 'Ask the operator for a password-reset link.' });
        }
      }),
    },
  });
}

export const auth = createAuth(db);
const signUpEmailSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()) });

class SignUpRejected extends Error {
  constructor(readonly response: Response) {
    super('Invitation sign-up was rejected');
  }
}

export async function redeemInvitation(request: Request, body: unknown) {
  const token = request.headers.get('x-invite-token');
  const email = signUpEmailSchema.safeParse(body);
  const rejected = () => Response.json(
    { message: 'A valid invitation for this email is required.' },
    { status: 403 },
  );

  if (!token || !email.success) return rejected();

  try {
    return await db.transaction(async (tx) => {
      const hash = tokenHash(token);
      const [invite] = await tx.select({ tokenHash: schema.invitations.tokenHash })
        .from(schema.invitations)
        .where(and(
          eq(schema.invitations.tokenHash, hash),
          eq(schema.invitations.email, email.data.email),
          isNull(schema.invitations.usedAt),
          gt(schema.invitations.expiresAt, sql`clock_timestamp()`),
        ))
        .for('update');

      if (!invite) return rejected();

      // Roll back the outer transaction for a rejected HTTP response as well
      // as a thrown handler error, so the invitation and account stay in sync.
      const response = await createAuth(tx, { allowSignUp: true }).handler(request);
      if (!response.ok) throw new SignUpRejected(response);

      await tx.update(schema.invitations)
        .set({ usedAt: new Date() })
        .where(eq(schema.invitations.tokenHash, hash));
      return response;
    });
  } catch (error) {
    if (error instanceof SignUpRejected) return error.response;
    throw error;
  }
}
