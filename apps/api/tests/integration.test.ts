import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { promisify } from 'node:util';
import { and, eq, like } from 'drizzle-orm';
import type { Command } from '@undercut/contracts';
import { buildApp } from '../src/app.js';
import { origin, tokenHash } from '../src/auth.js';
import { db, pool } from '../src/db.js';
import { invitations, receipts, user, verification } from '../src/schema.js';

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

  const buy = { type: 'buy', goodId: 'grain', quantity: 2 };
  const buys = await Promise.all([1, 2].map(() => request(commandPath, {
    actionId: randomUUID(), expectedRevision: 1, command: buy,
  }, owner.cookie)));
  assert.deepEqual(buys.map(({ statusCode }) => statusCode).sort(), [200, 409]);
  let campaign = (await request(campaignPath, undefined, owner.cookie)).json();
  assert.equal(campaign.state.gold, 94);
  assert.equal(campaign.revision, 2);
  assert.deepEqual((await request(commandPath, destination, owner.cookie)).json(), campaign);

  // Receipts created by the previous writer included the full campaign.
  await db.update(receipts).set({ response: sameAction[0].json() }).where(receiptKey);
  assert.deepEqual((await request(commandPath, destination, owner.cookie)).json(), campaign);

  const unaffordable = { actionId: randomUUID(), expectedRevision: 2, command: { ...buy, quantity: 99 } };
  assert.equal((await request(commandPath, unaffordable, owner.cookie)).statusCode, 422);
  assert.equal((await request(commandPath, {
    ...unaffordable,
    command: { ...buy, quantity: -4 },
  }, owner.cookie)).statusCode, 400);
  assert.equal((await request(commandPath, {
    ...unaffordable,
    command: { ...buy, goodId: '__proto__' },
  }, owner.cookie)).statusCode, 422);

  const shopDay: Command[] = [
    { type: 'shelf', slot: 0, goodId: 'grain', price: 5 },
    { type: 'open' },
    ...Array.from({ length: 8 }, () => ({ type: 'serve' } as const)),
    { type: 'close' },
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
