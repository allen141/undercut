import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';
import { Pool } from 'pg';

type TestAccount = { email: string; token: string };
const test = base.extend<{ account: TestAccount }>({
  account: async ({}, use) => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('Set TEST_DATABASE_URL to the disposable browser test database.');
    const pool = new Pool({ connectionString });
    const email = `platform-${randomUUID()}@undercut.invalid`;
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    try {
      await pool.query(
        'INSERT INTO invitations (token_hash, email, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')',
        [hash, email],
      );
      await use({ email, token });
    } finally {
      await pool.query('DELETE FROM auth_user WHERE email = $1', [email]);
      await pool.query('DELETE FROM invitations WHERE token_hash = $1', [hash]);
      await pool.end();
    }
  },
});

test('starts and renders the shop on this platform', { tag: '@smoke' }, async ({ page, account }: { page: Page; account: TestAccount }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const password = randomBytes(24).toString('base64url');
  const link = new URLSearchParams({ email: account.email, token: account.token });
  await page.goto(`/invite#${link}`);
  await page.getByLabel('Your name').fill('Platform smoke');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByLabel('Shop name').fill('Platform smoke shop');
  await page.getByRole('button', { name: 'Create campaign' }).click();

  const canvas = page.locator('.canvas-game canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-renderer', /^(webgl|canvas)$/);
  expect(pageErrors).toEqual([]);
});
