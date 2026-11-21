import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { promisify } from 'node:util';
import { and, eq, like, sql } from 'drizzle-orm';
import type { Command } from '@undercut/contracts';
import type { LegacyState, State } from '@undercut/game-core';
import { buildApp } from '../src/app.js';
import { origin, tokenHash } from '../src/auth.js';
import { db, pool } from '../src/db.js';
import { campaigns, invitations, receipts, user, verification } from '../src/schema.js';

const app = buildApp();
await app.ready();
const prefix = randomUUID();
const password = 'A secure test password 924!';

after(async () => {
  await app.close();
  await db.delete(invitations).where(like(invitations.email, `${prefix}-%`));
  await db.delete(user).where(like(user.email, `${prefix}-%`));
  await pool.end();
});

function request(path: string, body?: unknown, cookie = '', extra: Record<string, string> = {}) {
  return app.inject({
    method: body === undefined ? 'GET' : 'POST',
    url: path,
    headers: { origin, cookie, ...extra },
    ...(body === undefined ? {} : { payload: body as object }),
  });
}

function cookieHeader(response: Awaited<ReturnType<typeof request>>) {
  const cookie = response.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  assert.ok(cookie);
  return cookie;
}

async function invite(label: string, expiresAt = new Date(Date.now() + 60_000)) {
  const email = `${prefix}-${label}@example.invalid`;
  const token = randomBytes(32).toString('base64url');
  await db.insert(invitations).values({ tokenHash: tokenHash(token), email, expiresAt });
  return { email, token };
}

function signUp(email: string, token: string, attemptedPassword = password) {
  return request('/api/auth/sign-up/email', { email, password: attemptedPassword, name: 'Test Shopkeeper' }, '', {
    'x-invite-token': token,
  });
}

async function register(label: string) {
  const { email, token } = await invite(label);
  const response = await signUp(email, token);
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: cookieHeader(response), email, token, userId: response.json().user.id as string };
}

test('email-bound invitations are expiring, one-time and retryable after a rejected sign-up', async () => {
  const entry = await invite('registration');
  const otherEmail = `${prefix}-other@example.invalid`;
  assert.equal((await signUp(entry.email, '')).statusCode, 403);
  assert.equal((await signUp(otherEmail, entry.token)).statusCode, 403);

  const expired = await invite('expired', new Date(Date.now() - 1000));
  assert.equal((await signUp(expired.email, expired.token)).statusCode, 403);

  assert.equal((await signUp(entry.email, entry.token, 'short')).statusCode, 400);
  const originalInvite = await db.query.invitations.findFirst({
    where: eq(invitations.tokenHash, tokenHash(entry.token)),
  });
  assert.equal(originalInvite?.usedAt, null);

  const signupRace = await Promise.all([
    signUp(entry.email.toUpperCase(), entry.token),
    signUp(entry.email, entry.token),
  ]);
  assert.deepEqual(signupRace.map(({ statusCode }) => statusCode).sort(), [200, 403]);
  const successfulSignUp = signupRace.find(({ statusCode }) => statusCode === 200)!;
  const session = await request('/api/auth/get-session', undefined, cookieHeader(successfulSignUp));
  assert.equal(session.json().user.email, entry.email);
  assert.equal((await signUp(entry.email, entry.token)).statusCode, 403);
});

test('campaigns remain private, persist across sign-ins and apply each valid action once', async () => {
  const [owner, other] = await Promise.all([register('one'), register('two')]);
  const id = randomUUID();
  const create = { id, name: 'Test campaign' };
  const created = await request('/api/v1/campaigns', create, owner.cookie);
  assert.equal(created.statusCode, 200, created.body);
  assert.deepEqual((await request('/api/v1/campaigns', create, owner.cookie)).json(), created.json());
  assert.equal((await request('/api/v1/campaigns', { ...create, name: 'Other campaign' }, owner.cookie)).statusCode, 409);
  assert.equal((await request('/api/v1/campaigns', create, other.cookie)).statusCode, 409);

  const campaignPath = `/api/v1/campaigns/${id}`;
  const commandPath = `${campaignPath}/commands`;
  assert.equal((await request(campaignPath, undefined, other.cookie)).statusCode, 404);
  assert.equal((await request(campaignPath)).statusCode, 401);
  assert.deepEqual((await request('/api/v1/campaigns', undefined, other.cookie)).json(), []);

  const destination = {
    actionId: randomUUID(),
    expectedRevision: 0,
    command: { type: 'chooseTown', townId: 'meadow' },
  };
  assert.equal((await request(commandPath, destination, other.cookie)).statusCode, 404);
  const sameAction = await Promise.all([
    request(commandPath, destination, owner.cookie),
    request(commandPath, destination, owner.cookie),
  ]);
  assert.deepEqual(sameAction.map(({ statusCode }) => statusCode), [200, 200]);
  assert.equal(sameAction[0].json().revision, 1);
  assert.deepEqual(sameAction[0].json(), sameAction[1].json());

  const receiptKey = and(eq(receipts.campaignId, id), eq(receipts.actionId, destination.actionId));
  const [receipt] = await db.select().from(receipts).where(receiptKey);
  assert.deepEqual(receipt.response, { revision: 1 });
  assert.equal((await request(commandPath, {
    ...destination,
    command: { type: 'chooseTown', townId: 'forge' },
  }, owner.cookie)).statusCode, 409);
  assert.equal((await request(commandPath, {
    ...destination,
    actionId: randomUUID(),
  }, owner.cookie)).statusCode, 409);

  const vendorId = 'meadow-bargain';
  const { state } = sameAction[0].json<{ state: State }>();
  assert.equal(state.journal?.filter(event => event.type === 'townChosen').length, 1);
  const offer = state.vendorOffers[vendorId].find(({ kind, goodId }) => kind === 'regular' && goodId === 'grain');
  assert.ok(offer);
  const visit = await request(commandPath, {
    actionId: randomUUID(), expectedRevision: 1, command: { type: 'visitVendor', vendorId },
  }, owner.cookie);
  assert.equal(visit.statusCode, 200, visit.body);

  const buy = { type: 'buy', offerId: offer.id, quantity: 2 };
  const buys = await Promise.all([1, 2].map(() => request(commandPath, {
    actionId: randomUUID(), expectedRevision: 2, command: buy,
  }, owner.cookie)));
  assert.deepEqual(buys.map(({ statusCode }) => statusCode).sort(), [200, 409]);
  let campaign = (await request(campaignPath, undefined, owner.cookie)).json();
  assert.equal(campaign.state.gold, 100 - offer.unitCost * buy.quantity);
  assert.equal(campaign.revision, 3);
  assert.equal((campaign.state as State).journal?.filter(event => event.type === 'stockBought').length, 1);
  assert.deepEqual((await request(commandPath, destination, owner.cookie)).json(), campaign);

  // Receipts created by the previous writer included the full campaign.
  await db.update(receipts).set({ response: sameAction[0].json() }).where(receiptKey);
  assert.deepEqual((await request(commandPath, destination, owner.cookie)).json(), campaign);

  const overstock = { actionId: randomUUID(), expectedRevision: 3, command: { ...buy, quantity: 99 } };
  assert.equal((await request(commandPath, overstock, owner.cookie)).statusCode, 422);
  assert.equal((await request(commandPath, {
    ...overstock,
    command: { ...buy, quantity: -4 },
  }, owner.cookie)).statusCode, 400);
  assert.equal((await request(commandPath, {
    ...overstock,
    command: { ...buy, offerId: '__proto__' },
  }, owner.cookie)).statusCode, 422);

  const shopDay: Command[] = [
    { type: 'finishBuying' },
    { type: 'shelf', slot: 0, goodId: 'grain', price: 1 },
    { type: 'open' },
    { type: 'serve' },
    { type: 'nextDay' },
    { type: 'chooseTown', townId: 'forge' },
  ];
  for (const command of shopDay) {
    const response = await request(commandPath, {
      actionId: randomUUID(), expectedRevision: campaign.revision, command,
    }, owner.cookie);
    assert.equal(response.statusCode, 200, response.body);
    campaign = response.json();

    if (command.type === 'open') {
      assert.equal(campaign.state.customers.length, 8);
      assert.deepEqual((await request(campaignPath, undefined, owner.cookie)).json().state, campaign.state);
    }
  }
  assert.equal(campaign.state.day, 2);
  assert.equal(campaign.state.history.length, 1);

  const another = await request('/api/v1/campaigns', { id: randomUUID(), name: 'Second' }, owner.cookie);
  assert.equal(another.json().state.gold, 100);
  assert.equal((await request('/api/v1/campaigns', undefined, owner.cookie)).json().length, 2);

  const csrf = await request(commandPath, {
    actionId: randomUUID(), expectedRevision: campaign.revision, command: { type: 'open' },
  }, owner.cookie, { origin: 'https://evil.invalid' });
  assert.equal(csrf.statusCode, 403);

  const login = await request('/api/auth/sign-in/email', { email: owner.email, password });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = cookieHeader(login);
  assert.equal((await request(campaignPath, undefined, cookie)).json().revision, campaign.revision);
  assert.equal((await request('/api/auth/sign-out', {}, cookie)).statusCode, 200);
  assert.equal((await request('/api/v1/campaigns', undefined, cookie)).statusCode, 401);
});

test('loading an older campaign upgrades the response and leaves persistence to the next command', async () => {
  const owner = await register('legacy');
  const id = randomUUID();
  const legacy: LegacyState = {
    rulesVersion: 1,
    seed: 42,
    day: 3,
    phase: 'prepare',
    townId: 'meadow',
    gold: 94,
    inventory: { grain: [{ quantity: 2, unitCost: 3 }] },
    shelves: [{ goodId: 'grain', price: 5 }, { goodId: null, price: 1 }, { goodId: null, price: 1 }],
    customers: [],
    served: 0,
    revenue: 0,
    costOfSales: 0,
    purchases: 6,
    sold: 0,
    log: [],
    history: [],
  };
  const name = 'Older campaign';
  const revision = 9;
  const [stored] = await db.insert(campaigns).values({
    id, userId: owner.userId, name, revision, state: sql`${JSON.stringify(legacy)}::jsonb`,
  }).returning();

  const list = await request('/api/v1/campaigns', undefined, owner.cookie);
  assert.equal(list.statusCode, 200, list.body);
  assert.deepEqual(list.json(), [{ id, name, revision, updatedAt: stored.updatedAt.toISOString() }]);

  const campaignPath = `/api/v1/campaigns/${id}`;
  const detail = await request(campaignPath, undefined, owner.cookie);
  assert.equal(detail.statusCode, 200, detail.body);
  const campaign = detail.json<{ revision: number; state: State }>();
  assert.equal(campaign.revision, revision);
  assert.equal(campaign.state.rulesVersion, 1);
  assert.equal(campaign.state.phase, 'prepare');
  assert.equal(campaign.state.marketDay, legacy.day);
  assert.ok(campaign.state.vendorOffers['meadow-bargain'].length > 0);
  assert.deepEqual(campaign.state.inventory, legacy.inventory);
  assert.deepEqual(campaign.state.shelves, [...legacy.shelves, { goodId: null, price: 1 }]);
  const [afterRead] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  assert.deepEqual(afterRead, stored);

  const response = await request(`${campaignPath}/commands`, {
    actionId: randomUUID(), expectedRevision: revision, command: { type: 'finishBuying' },
  }, owner.cookie);
  assert.equal(response.statusCode, 200, response.body);
  const updated = response.json<{ revision: number; state: State }>();
  assert.equal(updated.revision, revision + 1);
  assert.deepEqual(updated.state, {
    ...campaign.state,
    buyingComplete: true,
    journal: [{ day: 3, type: 'buyingFinished' }],
  });
  const [afterCommand] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  assert.equal(afterCommand.revision, updated.revision);
  assert.deepEqual(afterCommand.state, updated.state);
});

async function operatorResetToken(email: string) {
  const output = await promisify(execFile)(process.execPath, [
    '--import', 'tsx', 'apps/api/src/operator.ts', 'reset', email,
  ], { env: process.env });
  const line = output.stdout.trim().split('\n').find((value) => value.startsWith('http'));
  assert.ok(line, 'Operator must return a reset link');
  const link = new URL(line);
  assert.equal(link.pathname, '/reset');
  assert.equal(link.search, '');
  const token = new URLSearchParams(link.hash.slice(1)).get('token');
  assert.ok(token);
  return token;
}

test('operator reset links are hashed, expiring and single-use even for concurrent resets', async () => {
  const account = await register('reset');
  const publicReset = await request('/api/auth/request-password-reset', { email: account.email });
  assert.equal(publicReset.statusCode, 403);

  const token = await operatorResetToken(account.email);
  const [stored] = await db.select().from(verification).where(eq(verification.value, account.userId));
  assert.ok(stored);
  assert.equal(stored.identifier.includes(token), false);

  const newPassword = 'A different secure password 738!';
  const reset = { token, newPassword };
  const concurrent = await Promise.all([
    request('/api/auth/reset-password', reset),
    request('/api/auth/reset-password', reset),
  ]);
  assert.deepEqual(concurrent.map(({ statusCode }) => statusCode).sort(), [200, 400]);
  assert.equal((await request('/api/auth/reset-password', reset)).statusCode, 400);
  assert.equal((await request('/api/v1/campaigns', undefined, account.cookie)).statusCode, 401);
  assert.equal((await request('/api/auth/sign-in/email', { email: account.email, password })).statusCode, 401);
  assert.equal((await request('/api/auth/sign-in/email', { email: account.email, password: newPassword })).statusCode, 200);

  const expiredToken = await operatorResetToken(account.email);
  await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(verification.value, account.userId));
  assert.equal((await request('/api/auth/reset-password', {
    token: expiredToken, newPassword: password,
  })).statusCode, 400);
  await db.delete(verification).where(eq(verification.value, account.userId));
});
