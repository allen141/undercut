import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { expect, test as base, type Page } from '@playwright/test';
import { Pool } from 'pg';
import type { CommandRequest } from '@undercut/contracts';
import { quantity, type State } from '@undercut/game-core';

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

const shopCanvas = (page: Page) => page.locator('canvas');
const action = (page: Page, name: string | RegExp) =>
  page.locator('[data-canvas-action]').and(page.getByRole('button', { name, exact: typeof name === 'string' }));

async function activate(page: Page, name: string | RegExp) {
  const button = action(page, name);
  await expect(button).toBeEnabled();
  const rect = await button.boundingBox();
  if (!rect) throw new Error(`Canvas action is outside the viewport: ${name}`);
  const [x, y] = [rect.x + rect.width / 2, rect.y + rect.height / 2];
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function createCampaign(page: Page, name: string) {
  await page.getByLabel('Shop name').fill(name);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(shopCanvas(page)).toBeVisible();
  await expectRevision(page, 0);
}

async function campaignSnapshot(page: Page) {
  const name = await page.locator('.canvas-game').getAttribute('aria-label');
  const campaigns = await (await page.request.get('/api/v1/campaigns')).json() as { id: string; name: string }[];
  const current = campaigns.find(campaign => campaign.name === name);
  if (!current) throw new Error(`Could not find active campaign ${name}`);
  const response = await page.request.get(`/api/v1/campaigns/${current.id}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { state: State };
}

async function expectRevision(page: Page, revision: number) {
  await expect(page.locator('.canvas-game')).toHaveAttribute('data-revision', String(revision));
  await expect(page.locator('.canvas-game')).toHaveAttribute('aria-busy', 'false');
}

async function expectStock(page: Page, good: string, amount: number) {
  const { state } = await campaignSnapshot(page);
  expect(quantity(state, good)).toBe(amount);
}

async function chooseTown(page: Page, name: string, keyboard = false) {
  if (keyboard) {
    const dial = action(page, 'Turn the door dial');
    await dial.focus();
    await expect(dial).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await activate(page, 'Turn the door dial');
  }
  await activate(page, 'Preview ' + name);
  await activate(page, 'Choose ' + name);
}

async function buy(page: Page, good: string, quantity = 1) {
  if (!(await action(page, 'Select ' + good).count())) await activate(page, 'Wholesaler');
  await activate(page, 'Select ' + good);
  for (let i = 1; i < quantity; i++) await activate(page, 'Increase quantity');
  await activate(page, 'Buy ' + good);
}

async function setShelf(page: Page, slot: number, good: string, price: number, revision: number) {
  if (await action(page, 'Close panel').count()) await activate(page, 'Close panel');
  await activate(page, `Shelf ${slot}`);
  await activate(page, `Display ${good[0].toUpperCase()}${good.slice(1)}`);
  await activate(page, 'Price per item');
  await activate(page, 'Clear price');
  for (const digit of String(price)) await activate(page, 'Digit ' + digit);
  await activate(page, 'Done');
  await activate(page, `Save shelf ${slot}`);
  await expectRevision(page, revision);
}

async function serveAndClose(page: Page, openingRevision: number) {
  await activate(page, 'Open the shop');
  await expectRevision(page, openingRevision);
  for (let i = 1; i <= 8; i++) {
    await activate(page, 'Serve customer');
    await expectRevision(page, openingRevision + i);
  }
  await activate(page, 'Close & review day');
  await expectRevision(page, openingRevision + 9);
  const { state } = await campaignSnapshot(page);
  expect(state.phase).toBe('report');
  expect(state.log).toHaveLength(8);
  await expect(page.locator('[data-canvas-ledger] li')).toHaveCount(8);
  await expect(page.locator('[data-canvas-report]')).toContainText(`${state.history.at(-1)?.profit}g`);
  expect(state.history.at(-1)?.profit).toBe(state.revenue - state.costOfSales);
}

async function screenshot(page: Page, path: string) {
  await expectNoOverflow(page);
  await expect(shopCanvas(page)).toHaveCount(1);
  await expect(shopCanvas(page)).toBeVisible();
  if (test.info().project.name !== 'desktop-firefox') {
    await expect(shopCanvas(page)).toHaveAttribute('data-renderer', 'webgl');
  }
  // Playwright's headless Firefox can lack a graphics driver even in Mesa environments.
  // It still exercises the same Pixi scene and hit targets through the software fallback.
  await expect(shopCanvas(page)).toHaveAttribute('data-renderer', /^(webgl|canvas)$/);
  const visibleControls = await page.locator('button, input, select').evaluateAll(elements =>
    elements.filter(element => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && style.visibility === 'visible' &&
        style.display !== 'none' && style.opacity !== '0' && style.clipPath === 'none';
    }).map(element => element.textContent?.trim()),
  );
  expect(visibleControls).toEqual([]);
  const canvas = await shopCanvas(page).boundingBox();
  const viewport = page.viewportSize();
  expect(canvas?.x).toBe(0);
  expect(canvas?.y).toBe(0);
  expect(canvas?.width).toBeCloseTo(viewport?.width ?? 0, 0);
  expect(canvas?.height).toBeCloseTo(viewport?.height ?? 0, 0);
  await page.screenshot({ path, animations: 'disabled' });
}

test('trades a full day and returns with its ledger and remaining stock', async ({ page, account }, info) => {
  test.skip(info.project.name === 'desktop-chromium', 'The desktop Chromium journey covers this flow over two days.');
  const errors = captureErrors(page);
  await invite(page, account);
  await createCampaign(page, 'Saffron Counter');
  await screenshot(page, info.outputPath('01-travel.png'));
  await chooseTown(page, 'Meadow');
  await expectRevision(page, 1);
  await buy(page, 'Grain', 3);
  await expectRevision(page, 2);
  await expectStock(page, 'grain', 3);
  await setShelf(page, 1, 'grain', 5, 3);
  await screenshot(page, info.outputPath('02-preparation.png'));
  await serveAndClose(page, 4);
  await screenshot(page, info.outputPath('03-report.png'));
  await page.reload();
  await page.getByRole('button', { name: /Saffron Counter/ }).click();
  await expectRevision(page, 13);
  expect((await campaignSnapshot(page)).state.log).toHaveLength(8);
  await activate(page, 'Day’s takings');
  await activate(page, 'Begin day 2');
  await expectRevision(page, 14);
  if (info.project.name === 'mobile-chromium') {
    const dial = action(page, 'Turn the door dial');
    const portraitDial = await dial.boundingBox();
    await page.setViewportSize({ width: 740, height: 390 });
    await expect.poll(() => shopCanvas(page).boundingBox()).toMatchObject({ width: 740, height: 390 });
    // Pixi rebuilds the room through ResizeObserver after the browser viewport changes.
    await expect.poll(() => dial.boundingBox()).not.toEqual(portraitDial);
    await chooseTown(page, 'Harbor');
    await expectRevision(page, 15);
    await buy(page, 'Tea');
    await expectRevision(page, 16);
    await screenshot(page, info.outputPath('04-landscape.png'));
  }
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('keeps two campaigns independent across two days, reconnects, and accepts a reset link', async ({ browser, context, page, account, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The connection and concurrency checks run in desktop Chromium.');
  const errors = captureErrors(page);
  await invite(page, account);
  await createCampaign(page, 'Lantern & Co.');
  await screenshot(page, info.outputPath('01-travel.png'));
  await chooseTown(page, 'Meadow', true);
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
  await buy(page, 'Grain', 3);
  const confirm = action(page, 'Confirm last action');
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveText('Could not reach the server. Check your connection and try again.');
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('offline');
  await expect(confirm).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: /Lantern & Co\./ }).click();
  await expectStock(page, 'grain', 3);
  await activate(page, 'Confirm last action');
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
    await buy(page, 'Herbs');
    await expectRevision(page, 3);
    await buy(secondPage, 'Tea');
    await expect(secondPage.getByRole('alert')).toContainText('changed on another device');
    await expectRevision(secondPage, 3);
    await expectStock(secondPage, 'herbs', 1);
    await expectStock(secondPage, 'tea', 0);
  } finally {
    await other.close();
  }

  await buy(page, 'Cloth');
  await expectRevision(page, 4);
  await setShelf(page, 1, 'grain', 5, 5);
  await setShelf(page, 2, 'herbs', 8, 6);
  await setShelf(page, 3, 'cloth', 15, 7);
  await screenshot(page, info.outputPath('02-preparation.png'));
  await serveAndClose(page, 8);
  await screenshot(page, info.outputPath('03-meadow-report.png'));

  await activate(page, 'Begin day 2');
  await expectRevision(page, 18);
  await chooseTown(page, 'Harbor');
  await expectRevision(page, 19);
  await buy(page, 'Tea', 2);
  await expectRevision(page, 20);
  await setShelf(page, 1, 'tea', 12, 21);
  await serveAndClose(page, 22);
  await screenshot(page, info.outputPath('04-harbor-report.png'));

  if (await action(page, 'Close panel').count()) await activate(page, 'Close panel');
  await activate(page, 'All campaigns');
  await createCampaign(page, 'Second Ledger');
  expect((await campaignSnapshot(page)).state.gold).toBe(100);
  await expectStock(page, 'tea', 0);
  if (await action(page, 'Close panel').count()) await activate(page, 'Close panel');
  await activate(page, 'All campaigns');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, account.email);
  await expect(page.getByRole('button', { name: /Second Ledger/ })).toBeVisible();
  await page.getByRole('button', { name: /Lantern & Co\./ }).click();
  await expectRevision(page, 31);
  expect((await campaignSnapshot(page)).state.phase).toBe('report');
  expect((await campaignSnapshot(page)).state.log).toHaveLength(8);

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
