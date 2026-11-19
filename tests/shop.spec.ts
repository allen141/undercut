import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { expect, test as base, type Page } from '@playwright/test';
import { Pool } from 'pg';
import type { CommandRequest } from '@undercut/contracts';

const run = promisify(execFile);
const password = 'browser-test-credential-41';
const newPassword = 'updated-browser-credential-52';

type TestAccount = { email: string; token: string };
const test = base.extend<{ account: TestAccount }>({
  account: async ({}, use) => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('Set TEST_DATABASE_URL to the disposable browser test database.');
    const pool = new Pool({ connectionString });
    const email = `browser-${randomUUID()}@undercut.invalid`;
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    try {
      await pool.query('INSERT INTO invitations (token_hash, email, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')', [hash, email]);
      await use({ email, token });
    } finally {
      await pool.query('DELETE FROM auth_user WHERE email = $1', [email]);
      await pool.query('DELETE FROM invitations WHERE token_hash = $1', [hash]);
      await pool.end();
    }
  },
});

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  return errors;
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function invite(page: Page, { email, token }: TestAccount) {
  await page.goto(`/invite#${new URLSearchParams({ email, token })}`);
  await expect(page).toHaveURL(/\/invite$/);
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await page.getByLabel('Your name').fill('Browser Playtester');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your campaigns' })).toBeVisible();
}

async function signIn(page: Page, email: string, passwordToUse = password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(passwordToUse);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your campaigns' })).toBeVisible();
}

async function createCampaign(page: Page, name: string) {
  await page.getByLabel('Shop name').fill(name);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expectRevision(page, 0);
}

async function expectRevision(page: Page, revision: number) {
  await expect(page.getByText(`Saved · revision ${revision}`, { exact: true })).toBeVisible();
}

async function expectStock(page: Page, good: string, amount: number) {
  await expect(page.locator(`[data-good="${good}"] b`)).toHaveText(String(amount));
}

async function setShelf(page: Page, slot: number, good: string, price: number, revision: number) {
  await page.getByRole('button', { name: new RegExp(`^Shelf ${slot} `) }).click();
  await page.getByLabel('Display good').selectOption(good);
  await page.getByLabel('Price per item').fill(String(price));
  await page.getByRole('button', { name: `Save shelf ${slot}`, exact: true }).click();
  await expectRevision(page, revision);
}

async function serveAndClose(page: Page, openingRevision: number) {
  await page.getByRole('button', { name: 'Open the shop' }).click();
  await expectRevision(page, openingRevision);
  for (let i = 1; i <= 8; i++) {
    await expect(page.getByText(`CUSTOMER ${i} OF 8`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Serve customer', exact: true }).click();
    await expectRevision(page, openingRevision + i);
  }
  await page.getByRole('button', { name: 'Close & review day' }).click();
  await expect(page.getByRole('heading', { name: 'Daily report' })).toBeVisible();
  await expect(page.locator('.ledger li')).toHaveCount(8);
  await expectRevision(page, openingRevision + 9);
  const report = page.locator('.report');
  const value = async (label: string) => Number((await report.getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd').innerText()).replace('g', ''));
  expect(await value('Trading profit')).toBe(await value('Sales revenue') - await value('Cost of goods sold'));
}

async function screenshot(page: Page, path: string) {
  await expectNoOverflow(page);
  await expect.poll(() => page.locator('.scene canvas, .scene-error').count()).toBe(1);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}

test('trades a full day and returns with its ledger and remaining stock', async ({ page, account }, info) => {
  test.skip(info.project.name === 'desktop-chromium', 'The desktop Chromium journey covers this flow over two days.');
  const errors = captureErrors(page);
  await invite(page, account);
  await createCampaign(page, 'Saffron Counter');
  await page.getByLabel('Market prices in Meadow').click();
  const market = page.getByRole('table', { name: 'Meadow market prices' });
  await expect(market.getByRole('row')).toHaveCount(7);
  await expect(market.getByRole('row', { name: /Grain 3g/ })).toBeVisible();
  await screenshot(page, info.outputPath('01-travel.png'));
  await page.getByRole('button', { name: 'Choose Meadow', exact: true }).click();
  await expectRevision(page, 1);
  await page.getByLabel('Quantity of Grain').fill('3');
  await page.getByRole('button', { name: 'Buy Grain', exact: true }).click();
  await expectRevision(page, 2);
  await expectStock(page, 'grain', 3);
  await setShelf(page, 1, 'grain', 5, 3);
  await screenshot(page, info.outputPath('02-preparation.png'));
  await serveAndClose(page, 4);
  await screenshot(page, info.outputPath('03-report.png'));
  await page.reload();
  await page.getByRole('button', { name: /Saffron Counter/ }).click();
  await expectRevision(page, 13);
  await expect(page.locator('.ledger li')).toHaveCount(8);
  await page.getByRole('button', { name: 'Begin day 2' }).click();
  await expectRevision(page, 14);
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('keeps two campaigns independent across two days, reconnects, and accepts a reset link', async ({ browser, context, page, account, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The connection and concurrency checks run in desktop Chromium.');
  const errors = captureErrors(page);
  await invite(page, account);
  await createCampaign(page, 'Lantern & Co.');
  await page.getByLabel('Market prices in Meadow').click();
  await expect(page.getByRole('table', { name: 'Meadow market prices' }).getByRole('row')).toHaveCount(7);
  await screenshot(page, info.outputPath('01-travel.png'));
  await expect(page.locator('.scene canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Choose Meadow', exact: true }).click();
  await expectRevision(page, 1);

  const requests: CommandRequest[] = [];
  await page.route('**/commands', async route => {
    const command = route.request().postDataJSON() as CommandRequest;
    requests.push(command);
    if (requests.length === 1) {
      const accepted = await route.fetch();
      expect(accepted.ok()).toBeTruthy();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByLabel('Quantity of Grain').fill('3');
  await page.getByRole('button', { name: 'Buy Grain', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm last action' });
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveText('Could not reach the server. Check your connection and try again.');
  await context.setOffline(true);
  await expect(page.getByText('You’re offline. Reconnect to continue trading.')).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Buy Grain', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: /Lantern & Co\./ }).click();
  await expectStock(page, 'grain', 3);
  await confirm.click();
  await expectRevision(page, 2);
  await expectStock(page, 'grain', 3);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  await page.unroute('**/commands');

  const other = await browser.newContext({ baseURL });
  try {
    const secondPage = await other.newPage();
    await secondPage.goto('/');
    await signIn(secondPage, account.email);
    await secondPage.getByRole('button', { name: /Lantern & Co\./ }).click();
    await expectRevision(secondPage, 2);
    await page.getByRole('button', { name: 'Buy Herbs', exact: true }).click();
    await expectRevision(page, 3);
    await secondPage.getByRole('button', { name: 'Buy Tea', exact: true }).click();
    await expect(secondPage.getByRole('alert')).toContainText('changed on another device');
    await expectRevision(secondPage, 3);
    await expectStock(secondPage, 'herbs', 1);
    await expectStock(secondPage, 'tea', 0);
  } finally {
    await other.close();
  }

  await page.getByRole('button', { name: 'Buy Cloth', exact: true }).click();
  await expectRevision(page, 4);
  await setShelf(page, 1, 'grain', 5, 5);
  await setShelf(page, 2, 'herbs', 8, 6);
  await setShelf(page, 3, 'cloth', 15, 7);
  await screenshot(page, info.outputPath('02-preparation.png'));
  await serveAndClose(page, 8);
  await screenshot(page, info.outputPath('03-meadow-report.png'));

  await page.getByRole('button', { name: 'Begin day 2' }).click();
  await expectRevision(page, 18);
  await page.getByRole('button', { name: 'Choose Harbor', exact: true }).click();
  await expectRevision(page, 19);
  await page.getByLabel('Quantity of Tea').fill('2');
  await page.getByRole('button', { name: 'Buy Tea', exact: true }).click();
  await expectRevision(page, 20);
  await setShelf(page, 1, 'tea', 12, 21);
  await serveAndClose(page, 22);
  await screenshot(page, info.outputPath('04-harbor-report.png'));

  await page.getByRole('button', { name: 'All campaigns' }).click();
  await createCampaign(page, 'Second Ledger');
  await expect(page.getByText('100g', { exact: true })).toBeVisible();
  await expectStock(page, 'tea', 0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, account.email);
  await expect(page.getByRole('button', { name: /Second Ledger/ })).toBeVisible();
  await page.getByRole('button', { name: /Lantern & Co\./ }).click();
  await expectRevision(page, 31);
  await expect(page.getByRole('heading', { name: 'Daily report' })).toBeVisible();
  await expect(page.locator('.ledger li')).toHaveCount(8);

  if (!process.env.BETTER_AUTH_SECRET) throw new Error('Set BETTER_AUTH_SECRET to the test API’s secret to exercise operator password reset.');
  const { stdout } = await run(process.execPath, ['--import', 'tsx', 'apps/api/src/operator.ts', 'reset', account.email], {
    env: { ...process.env, APP_ORIGIN: baseURL, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
  const resetLink = stdout.trim().split('\n').find(line => line.startsWith(`${baseURL}/`));
  if (!resetLink) throw new Error('The reset operator did not return a URL for the test account.');
  await page.goto(resetLink);
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();
  await signIn(page, account.email, newPassword);
  await expect(page.getByRole('button', { name: /Lantern & Co\./ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Second Ledger/ })).toBeVisible();
  expect(errors.filter(error => !error.includes('net::ERR_FAILED'))).toEqual([]);
});
