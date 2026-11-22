import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { expect, test as base, type Page } from '@playwright/test';
import { Pool } from 'pg';
import type { CommandRequest } from '@undercut/contracts';
import { WINDOW_SLOT_INDEX, applyCommand, newGame, quantity, type State } from '@undercut/game-core';
import { roomLayout, shopScale, type Bounds } from '../apps/web/src/ShopLayout.js';

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

async function dismissDayLedger(page: Page) {
  const ledger = page.getByRole('dialog', { name: 'The shop ledger' });
  await ledger.getByRole('button', { name: 'Continue trading' }).first().click();
  await expect(ledger).toHaveCount(0);
}

async function createCampaign(page: Page, name: string) {
  await page.getByLabel('Shop name').fill(name);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(shopCanvas(page)).toBeVisible();
  await expectRevision(page, 0);
  await page.locator('.ledger-menu').click();
  const ledger = page.getByRole('dialog', { name: 'The shop ledger' });
  await expect(ledger).toBeVisible();
  const pages = ledger.getByRole('navigation', { name: 'Ledger pages' });
  for (const title of ['Inventory', 'Performance', 'Locations & prices', 'Events', 'Newspapers']) {
    await pages.getByRole('button', { name: title, exact: true }).click();
    await expect(ledger.locator('.ledger-content > h2')).toHaveText(title);
  }
  await dismissDayLedger(page);
  await expect(page.locator('.ledger-menu')).toBeVisible();
}

async function campaignSnapshot(page: Page) {
  const name = await page.locator('.canvas-game').getAttribute('aria-label');
  const campaigns = await (await page.request.get('/api/v1/campaigns')).json() as { id: string; name: string }[];
  const current = campaigns.find(campaign => campaign.name === name);
  if (!current) throw new Error(`Could not find active campaign ${name}`);
  const response = await page.request.get(`/api/v1/campaigns/${current.id}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { id: string; revision: number; state: State };
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
  const preview = 'Preview ' + name;
  const confirm = 'Choose ' + name;
  if (await action(page, 'Choose today’s town').count()) await activate(page, 'Choose today’s town');
  if (keyboard) {
    await action(page, preview).focus();
    await page.keyboard.press('Enter');
    await expect(action(page, preview)).toHaveAttribute('aria-pressed', 'true');
    await action(page, confirm).focus();
    await page.keyboard.press('Enter');
  } else {
    await activate(page, preview);
    await activate(page, confirm);
  }
}

async function roomViewport(page: Page) {
  const canvas = (await shopCanvas(page).boundingBox())!;
  const scale = shopScale(canvas.width, canvas.height);
  const layout = roomLayout(canvas.width / scale, canvas.height / scale);
  const clip = (bounds: Bounds, x: number, y: number, w: number, h: number) => ({
    x: canvas.x + (bounds.x + bounds.w * x) * scale,
    y: canvas.y + (bounds.y + bounds.h * y) * scale,
    width: bounds.w * w * scale,
    height: bounds.h * h * scale,
  });
  return { layout, clip, width: canvas.width / scale, height: canvas.height / scale };
}

async function meanPixelDifference(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(async screenshots => {
    const images = await Promise.all(screenshots.map(async data => {
      const png = Uint8Array.from(atob(data), character => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    }));
    const [first, second] = images;
    if (first.length !== second.length) return Number.POSITIVE_INFINITY;
    let error = 0;
    for (let i = 0; i < first.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) error += Math.abs(first[i + channel] - second[i + channel]);
    }
    return error / (first.length * .75);
  }, [before.toString('base64'), after.toString('base64')]);
}

async function checkTownJournal(page: Page, name: string, issue: string, picture: string, day: number) {
  const openJournal = `Open ${name} Journal`;
  // The canvas observes the saved revision asynchronously. Capture after its town control appears.
  await expect(action(page, openJournal)).toBeEnabled();
  const room = await roomViewport(page);
  const clip = room.clip(room.layout.window, .14, .12, .72, .68);
  const windowBefore = await page.screenshot({ clip });
  await activate(page, openJournal);
  const journal = page.getByRole('region', { name: `${name} Journal` });
  await expect(journal).toContainText('Market history');
  await expect(journal).toContainText('Market news');
  await expect(journal).toContainText(`Day ${day}, `);
  // Check the rendered pixels to catch dimming as well as pages covering the glass.
  await expect.poll(async () => meanPixelDifference(page, windowBefore, await page.screenshot({ clip }))).toBeLessThan(3);
  await screenshot(page, picture);
  await activate(page, new RegExp(issue));
  await expect(journal).toContainText(/(?:available at|sold out)/);
  await activate(page, 'Back to journal');
  await expect(journal).toContainText('Market history');
  await activate(page, 'Close panel');
}

async function visit(page: Page, vendor: string) {
  if (!(await action(page, 'Visit ' + vendor).count())) await activate(page, 'Open wholesale book');
  await activate(page, 'Visit ' + vendor);
}

async function buy(page: Page, good: string, quantity = 1) {
  if (!(await action(page, 'Select ' + good).count())) await activate(page, 'Open wholesale book');
  await activate(page, 'Select ' + good);
  for (let i = 1; i < quantity; i++) await activate(page, 'Increase quantity');
  await activate(page, 'Buy ' + good);
}

async function setDisplay(page: Page, slot: number, good: string, price: number, revision: number) {
  const display = slot === WINDOW_SLOT_INDEX ? 'Window display' : `Floor display ${slot + 1}`;
  const closePanel = action(page, 'Close panel');
  const displayAction = action(page, display);
  await expect.poll(async () => (await closePanel.count()) > 0 || (await displayAction.count()) > 0).toBe(true);
  if (await closePanel.count()) {
    await activate(page, 'Close panel');
    await expect(closePanel).toHaveCount(0);
  }
  await expect(displayAction).toBeEnabled();
  const displayBounds = await displayAction.boundingBox();
  if (!displayBounds) throw new Error(`Canvas action is outside the viewport: ${display}`);
  const [x, y] = [displayBounds.x + displayBounds.width / 2, displayBounds.y + displayBounds.height / 2];
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await activate(page, `Display ${good[0].toUpperCase()}${good.slice(1)}`);
  await activate(page, 'Price per item');
  await activate(page, 'Clear price');
  for (const digit of String(price)) await activate(page, 'Digit ' + digit);
  await activate(page, 'Done');
  await activate(page, `Save ${display.toLowerCase()}`);
  await expectRevision(page, revision);
  expect((await campaignSnapshot(page)).state.shelves[slot]).toEqual({ goodId: good.toLowerCase(), price });
}

async function seedGrainNegotiation(page: Page, name: string) {
  const { id } = await campaignSnapshot(page);
  let seed: number;
  for (seed = 1; seed < 1000; seed++) {
    let state = applyCommand(newGame(seed), { type: 'chooseTown', townId: 'meadow' });
    state = applyCommand(state, { type: 'visitVendor', vendorId: 'meadow-bargain' });
    const offer = state.vendorOffers['meadow-bargain'].find(row => row.goodId === 'grain' && row.kind === 'regular')!;
    state = applyCommand(state, { type: 'buy', offerId: offer.id, quantity: 3 });
    state = applyCommand(state, { type: 'finishBuying' });
    state = applyCommand(state, { type: 'shelf', slot: WINDOW_SLOT_INDEX, goodId: 'grain', price: 5 });
    state = applyCommand(state, { type: 'open' });
    const negotiation = applyCommand(state, { type: 'serve' }).pendingNegotiation;
    if (negotiation && negotiation.customerIndex >= 2) break;
  }
  expect(seed).toBeLessThan(1000);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query("UPDATE campaigns SET state = jsonb_set(state, '{seed}', to_jsonb($1::int)) WHERE id = $2", [seed, id]);
  } finally {
    await pool.end();
  }
  await page.reload();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expectRevision(page, 0);
}

async function watchVisitorOutcomes(page: Page) {
  return page.evaluateHandle(() => {
    const status = document.querySelector('[data-canvas-status]')!;
    const timeline: { text: string; at: number; visits: number; stock: string }[] = [];
    new MutationObserver(() => {
      timeline.push({
        text: status.textContent ?? '',
        at: performance.now(),
        visits: document.querySelectorAll('[data-canvas-ledger] li').length,
        stock: document.querySelector('[data-canvas-stock]')?.textContent ?? '',
      });
    }).observe(status, { childList: true, characterData: true, subtree: true });
    return timeline;
  });
}

async function serveAndClose(page: Page, openingRevision: number, reloadAtOffer?: string) {
  const report = page.locator('[data-canvas-report]');
  const closing = action(page, 'Day’s takings');
  const accept = action(page, 'Accept offer');
  let timeline = reloadAtOffer ? await watchVisitorOutcomes(page) : undefined;
  const checkDoor = test.info().project.name.endsWith('-chromium');
  const room = await roomViewport(page);
  const clip = room.clip(room.layout.door, .42, .72, .17, .18);
  const closedDoor = checkDoor ? await page.screenshot({ clip }) : undefined;
  await activate(page, 'Open the shop');
  await expect(action(page, 'Serve customer')).toHaveCount(0);
  if (closedDoor) {
    await expect(action(page, 'Open business book')).toBeEnabled();
    await expect.poll(async () => (await page.screenshot({ clip })).equals(closedDoor)).toBe(false);
    await page.screenshot({ path: test.info().outputPath('business-open-door.png') });
  }
  if (reloadAtOffer) {
    await expect(page.locator('[data-canvas-status]')).toContainText(/^Customer 2 of 8\. Looking for/);
    await activate(page, 'Hurry this visitor');
    await expect(page.locator('[data-canvas-status]')).toContainText(/^Customer 2 of 8\..*(?:Sale made|No sale)/);
    await expect(action(page, 'Hurry this visitor')).toHaveCount(0);
  }
  let negotiations = 0;
  for (;;) {
    await expect.poll(async () => await closing.count() === 1 || await accept.count() === 1 && await accept.isEnabled(),
      { timeout: 50_000 }).toBe(true);
    if (await closing.count()) break;
    negotiations++;
    expect(negotiations).toBeLessThanOrEqual(2);
    if (reloadAtOffer && negotiations === 1) {
      const saved = await campaignSnapshot(page);
      expect(saved.state.pendingNegotiation).not.toBeNull();
      const events = await timeline!.jsonValue();
      const firstArrival = events.find(event => event.visits === 0 && event.text.startsWith('Customer 1 of 8.'));
      const first = events.find(event => event.visits === 1 && event.text.startsWith('Customer 1 of 8.'));
      const secondArrival = events.find(event => event.visits === 1 && event.text.startsWith('Customer 2 of 8.'));
      const second = events.find(event => event.visits === 2 && event.text.startsWith('Customer 2 of 8.'));
      expect(first?.text).toMatch(/(?:Sale made|No sale)/);
      expect(second?.text).toMatch(/(?:Sale made|No sale)/);
      expect(first!.at - firstArrival!.at).toBeGreaterThanOrEqual(3500);
      expect(secondArrival!.at - firstArrival!.at).toBeGreaterThanOrEqual(4800);
      expect(second!.at - secondArrival!.at).toBeLessThan(3000);
      await page.reload();
      await page.getByRole('button', { name: new RegExp(reloadAtOffer) }).click();
      await expectRevision(page, saved.revision);
      await expect(accept).toBeEnabled();
      expect((await campaignSnapshot(page)).state.pendingNegotiation).toEqual(saved.state.pendingNegotiation);
      timeline = await watchVisitorOutcomes(page);
    }
    await activate(page, 'Accept offer');
    await expect(accept).toHaveCount(0);
  }
  if (reloadAtOffer) expect(negotiations).toBeGreaterThan(0);
  const { state, revision } = await campaignSnapshot(page);
  expect(revision).toBe(openingRevision + 1 + negotiations);
  await expectRevision(page, revision);
  expect(state.phase).toBe('report');
  expect(state.log).toHaveLength(8);
  expect(state.negotiations).toHaveLength(negotiations);
  if (timeline) {
    await expect(page.locator('[data-canvas-status]')).toContainText('closed');
    const events = await timeline.jsonValue();
    const negotiatedSale = events.find(event => event.text.includes('Offer accepted.') && event.text.includes('You received'));
    const last = events.find(event => event.visits === 8 && event.text.startsWith('Customer 8 of 8.'));
    const finished = events.find(event => event.text.includes('closed.'));
    expect(negotiatedSale?.stock).toContain(`Grain ${3 - state.customerResults.filter(result =>
      result.customerIndex < negotiatedSale!.visits && result.goodId === 'grain' && result.price !== null).length}`);
    expect(last?.text).toMatch(/(?:Sale made|No sale|Offer accepted)/);
    expect(finished!.at - last!.at).toBeGreaterThanOrEqual(1000);
    await timeline.dispose();
  }
  await expect(page.locator('[data-canvas-ledger] li')).toHaveCount(8);
  await expect(report).toContainText(`${state.history.at(-1)?.profit}g`);
  expect(state.history.at(-1)?.profit).toBe(state.revenue - state.costOfSales);
  if (closedDoor) {
    const nightDoor = await page.screenshot({ clip });
    const difference = await page.evaluate(async screenshots => {
      const [daylight, night] = await Promise.all(screenshots.map(async data => {
        const png = Uint8Array.from(atob(data), character => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      }));
      // The shaded lower panel shows the same closed door, under the room's night tint.
      const tint = [0x17, 0x17, 0x2d];
      const opacity = .12;
      let error = 0;
      for (let i = 0; i < daylight.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) {
          const expected = daylight[i + channel] * (1 - opacity) + tint[channel] * opacity;
          error += Math.abs(night[i + channel] - expected);
        }
      }
      return error / (daylight.length * .75);
    }, [closedDoor.toString('base64'), nightDoor.toString('base64')]);
    // Allow for integer rounding in the WebGL blend and screenshot conversion.
    expect(difference).toBeLessThan(5);
  }
  await activate(page, 'Day’s takings');
  return revision;
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
      return !element.closest('.ledger-menu') && bounds.width > 0 && bounds.height > 0 && style.visibility === 'visible' &&
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

test('previews towns on the dial and confirms the destination', { tag: '@smoke' }, async ({ page, account }, info) => {
  test.skip(!['mobile-chromium', 'desktop-chromium'].includes(info.project.name), 'The focused dial journey uses Chromium.');
  test.setTimeout(30_000);
  await invite(page, account);
  await createCampaign(page, 'Preview Smoke Shop');
  const commands: CommandRequest['command'][] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/commands')) {
      commands.push((request.postDataJSON() as CommandRequest).command);
    }
  });
  await expect(shopCanvas(page)).toHaveAttribute('data-renderer', 'webgl');
  await expectNoOverflow(page);
  const paper = page.getByRole('region', { name: 'The Wandering Gazette' });
  await expect(paper).toContainText('Morning edition · Day 1');
  await expect(paper).toContainText('Market outlook');
  await activate(page, 'Choose today’s town');
  await expect(action(page, 'Preview Meadow')).toHaveAttribute('aria-pressed', 'true');
  const atlas = page.getByRole('region', { name: 'Route Atlas' });
  await expect(atlas).toContainText('Meadow · Grain & herbs');
  await activate(page, 'Close panel');
  await expect(atlas).toHaveCount(0);
  await screenshot(page, info.outputPath('room-and-wall.png'));
  await activate(page, 'Open route atlas');
  await expect(atlas.getByText(/Global average \d/)).toHaveCount(6);
  await expect(atlas).toContainText('Crystal. Day 1, unavailable.');
  const room = await roomViewport(page);
  const doorCenter = room.clip(room.layout.door, .5, 0, 0, 0).x;
  const confirm = (await action(page, 'Choose Meadow').boundingBox())!;
  const confirmCenter = confirm.x + confirm.width / 2;
  const dialBounds = room.clip(room.layout.travelDial, 0, 0, 1, 1);
  expect(confirmCenter).toBeGreaterThanOrEqual(dialBounds.x);
  expect(confirmCenter).toBeLessThanOrEqual(dialBounds.x + dialBounds.width);
  const { bookBelowWall, window, door, horizon, page: reading, travelDial, shelves } = room.layout;
  expect(window.w / room.layout.scene.w).toBeGreaterThan(.4);
  expect(door.w / room.width).toBeGreaterThan(.145);
  expect(window.y).toBeLessThan(bookBelowWall ? reading.y : 74);
  expect(window.y + window.h).toBeCloseTo(horizon);
  expect(window.x + window.w).toBeLessThan(door.x);
  expect(travelDial.x).toBeGreaterThanOrEqual(7);
  expect(travelDial.x + travelDial.w).toBeLessThanOrEqual(room.width - 7);
  expect(Math.abs(travelDial.x + travelDial.w / 2 - (door.x + door.w / 2))).toBeLessThanOrEqual(travelDial.w / 2);
  if (bookBelowWall) {
    expect(window.y + window.h).toBeLessThan(reading.y);
  } else {
    expect(reading.x + reading.w).toBeLessThan(door.x);
  }
  const sill = shelves[WINDOW_SLOT_INDEX];
  expect(sill.w).toBeLessThan(window.w * .65);
  expect(sill.y).toBeGreaterThan(window.y + window.h * .78);
  const clip = room.clip(room.layout.window, .18, .32, .64, .46);
  const meadowVista = await page.screenshot({ clip });
  await activate(page, 'Preview Forge');
  await expect(atlas).toContainText('Forge · Iron & crystal');
  await expect(action(page, 'Preview Forge')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await page.screenshot({ clip })).equals(meadowVista)).toBe(false);
  await screenshot(page, info.outputPath('route-atlas-and-wall.png'));
  await expectRevision(page, 0);
  expect(commands).toEqual([]);
  await chooseTown(page, 'Harbor', info.project.name === 'desktop-chromium');
  await expectRevision(page, 1);
  expect(commands).toEqual([{ type: 'chooseTown', townId: 'harbor' }]);
  await expect(action(page, 'Preview Harbor')).toHaveCount(0);
  await expect(action(page, 'Open wholesale book')).toBeEnabled();
  const { state } = await campaignSnapshot(page);
  expect(state.townId).toBe('harbor');
  expect(state.phase).toBe('prepare');
});

test('trades a full day and returns with its ledger and remaining stock', async ({ page, account }, info) => {
  test.skip(info.project.name === 'desktop-chromium', 'The desktop Chromium journey covers this flow over two days.');
  if (info.project.name === 'desktop-firefox') await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors = captureErrors(page);
  await invite(page, account);
  await createCampaign(page, 'Saffron Counter');
  await seedGrainNegotiation(page, 'Saffron Counter');
  await activate(page, 'Choose today’s town');
  await expect(page.getByRole('region', { name: 'Route Atlas' })).toContainText('Meadow · Grain & herbs');
  await screenshot(page, info.outputPath('01-travel.png'));
  await chooseTown(page, 'Meadow');
  await expectRevision(page, 1);
  await checkTownJournal(page, 'Meadow', '^Mill Yard ·', info.outputPath('journal-portrait.png'), 1);
  await visit(page, 'Mill Yard');
  await expectRevision(page, 2);
  await buy(page, 'Grain', 3);
  await expectRevision(page, 3);
  await expectStock(page, 'grain', 3);
  await activate(page, 'Finish buying');
  await expectRevision(page, 4);
  await setDisplay(page, WINDOW_SLOT_INDEX, 'grain', 5, 5);
  await screenshot(page, info.outputPath('02-preparation.png'));
  const closingRevision = await serveAndClose(page, 6, 'Saffron Counter');
  await screenshot(page, info.outputPath('03-report.png'));
  await page.reload();
  await page.getByRole('button', { name: /Saffron Counter/ }).click();
  await expectRevision(page, closingRevision);
  expect((await campaignSnapshot(page)).state.log).toHaveLength(8);
  await activate(page, 'Day’s takings');
  await activate(page, 'Begin day 2');
  await expectRevision(page, closingRevision + 1);
  await expect(page.getByRole('region', { name: 'The Wandering Gazette' })).toContainText('Morning edition · Day 2');
  await activate(page, 'Choose today’s town');
  await expect(page.getByRole('region', { name: 'Route Atlas' })).toContainText('Day 2');
  if (info.project.name === 'mobile-chromium') {
    const dial = action(page, 'Preview Meadow');
    const portraitDial = await dial.boundingBox();
    await page.setViewportSize({ width: 740, height: 390 });
    await expect.poll(() => shopCanvas(page).boundingBox()).toMatchObject({ width: 740, height: 390 });
    // Pixi rebuilds the room through ResizeObserver after the browser viewport changes.
    await expect.poll(() => dial.boundingBox()).not.toEqual(portraitDial);
    await chooseTown(page, 'Harbor');
    await expectRevision(page, closingRevision + 2);
    await checkTownJournal(page, 'Harbor', '^Dockside Lots ·', info.outputPath('journal-landscape.png'), 2);
    await visit(page, 'Dockside Lots');
    await expectRevision(page, closingRevision + 3);
    await buy(page, 'Tea');
    await expectRevision(page, closingRevision + 4);
    await screenshot(page, info.outputPath('04-landscape.png'));
  }
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('fits and accepts touch within a zoomed Android viewport', async ({ page, account }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'Uses Chrome DevTools to reproduce Android page zoom.');
  await page.setViewportSize({ width: 360, height: 700 });
  await invite(page, account);
  const cdp = await page.context().newCDPSession(page);
  const shopName = page.getByLabel('Shop name');
  await shopName.fill('Pocket Counter');
  // The shop must lay out correctly when the lobby is already zoomed.
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.7 });
  await shopName.press('Enter');
  await expect(shopCanvas(page)).toBeVisible();
  await expectRevision(page, 0);
  const viewportFit = () => shopCanvas(page).evaluate((canvas: HTMLCanvasElement) => {
    const viewport = visualViewport!;
    const box = canvas.getBoundingClientRect();
    return {
      zoom: viewport.scale,
      deviceRatio: devicePixelRatio,
      backingRatio: canvas.width / box.width,
      left: Math.abs(box.x - viewport.offsetLeft),
      top: Math.abs(box.y - viewport.offsetTop),
      width: Math.abs(box.width - viewport.width),
      height: Math.abs(box.height - viewport.height),
    };
  });
  await expect.poll(async () => {
    const result = await viewportFit();
    return Math.max(result.left, result.top, result.width, result.height);
  }).toBeLessThan(2);
  const zoomed = await viewportFit();
  expect(zoomed.zoom).toBeCloseTo(1.7, 2);
  expect(zoomed.deviceRatio).toBeGreaterThan(2);
  expect(zoomed.backingRatio).toBeCloseTo(2, 1);
  await chooseTown(page, 'Meadow');
  await expectRevision(page, 1);
  await visit(page, 'Mill Yard');
  await expectRevision(page, 2);
  await buy(page, 'Grain');
  await expectRevision(page, 3);
  await expectStock(page, 'grain', 1);
  await activate(page, 'Finish buying');
  await expectRevision(page, 4);
  await activate(page, 'Close panel');
  for (const name of ['All campaigns', 'Inventory and gold', 'Open wholesale book', 'Open the shop',
    'Window display', 'Floor display 1', 'Floor display 2', 'Floor display 3']) {
    const target = action(page, name);
    await expect(target).toHaveCount(1);
    expect(await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const viewport = visualViewport!;
      return box.left >= viewport.offsetLeft - 1 && box.top >= viewport.offsetTop - 1 &&
        box.right <= viewport.offsetLeft + viewport.width + 1 &&
        box.bottom <= viewport.offsetTop + viewport.height + 1;
    })).toBe(true);
  }
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  // The CDP scale shortcut updates metrics without sending a resize event.
  await page.evaluate(() => visualViewport!.dispatchEvent(new Event('resize')));
  await expect.poll(async () => {
    const result = await viewportFit();
    return Math.max(result.left, result.top, result.width, result.height);
  }).toBeLessThan(2);
});

test('docks the Accounts Book across a phone running in desktop viewport mode', async ({ page, account }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'Reproduces the wide CSS viewport of desktop mode on Android.');
  await page.setViewportSize({ width: 393, height: 720 });
  await invite(page, account);
  await createCampaign(page, 'Harbor Closing');
  const { id } = await campaignSnapshot(page);
  let state = applyCommand({ ...newGame(27), day: 9 }, { type: 'chooseTown', townId: 'harbor' });
  state = applyCommand(state, { type: 'finishBuying' });
  state = applyCommand(state, { type: 'open' });
  state = applyCommand(state, { type: 'serve' });
  expect(state.phase).toBe('report');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query('UPDATE campaigns SET state = $1 WHERE id = $2', [JSON.stringify(state), id]);
  } finally {
    await pool.end();
  }

  await page.reload();
  await page.getByRole('button', { name: /Harbor Closing/ }).click();
  await activate(page, 'Day’s takings');
  const accounts = page.getByRole('region', { name: 'Accounts Book' });
  await expect(accounts).toContainText('Day 9 · Harbor');
  const nextDay = action(page, 'Begin day 10');
  const visibleBounds = () => nextDay.evaluate(button => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const bounds = button.getBoundingClientRect();
    return {
      widthShare: bounds.width / canvas.width,
      bottomGap: (canvas.bottom - bounds.bottom) * visualViewport!.scale,
    };
  });
  await expect.poll(async () => (await visibleBounds()).widthShare).toBeGreaterThan(.85);
  await expect.poll(async () => (await visibleBounds()).bottomGap).toBeLessThan(25);

  // A real phone can fit a 980 CSS pixel desktop viewport into its narrow screen.
  // Resize while the book is open to cover that path as well as initial layout.
  await page.locator('meta[name="viewport"]').evaluate(meta => meta.setAttribute('content', 'width=980'));
  await expect.poll(() => page.evaluate(() => visualViewport!.width)).toBeGreaterThan(900);
  await expect.poll(() => page.evaluate(() => visualViewport!.scale)).toBeLessThan(.6);
  await expect.poll(async () => (await visibleBounds()).widthShare).toBeGreaterThan(.85);
  await expect.poll(async () => (await visibleBounds()).bottomGap).toBeLessThan(25);
  await page.screenshot({ path: info.outputPath('accounts-book-desktop-mode.png') });
  await activate(page, 'Begin day 10');
  await expectRevision(page, 1);
  await expect(page.getByRole('region', { name: 'The Wandering Gazette' })).toContainText('Morning edition · Day 10');
  await activate(page, 'Choose today’s town');
  await expect(page.getByRole('region', { name: 'Route Atlas' })).toContainText('Day 10');
});

test('keeps two campaigns independent across two days, reconnects, and accepts a reset link', async ({ browser, context, page, account, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The connection and concurrency checks run in desktop Chromium.');
  test.setTimeout(220_000);
  // Two full days, reconnect, a second tab and password reset run through software WebGL on CI.
  test.setTimeout(300_000);
  const errors = captureErrors(page);
  await invite(page, account);
  await createCampaign(page, 'Lantern & Co.');
  await screenshot(page, info.outputPath('01-travel.png'));
  await chooseTown(page, 'Meadow', true);
  await expectRevision(page, 1);
  await visit(page, 'Mill Yard');
  await expectRevision(page, 2);

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
  await expectRevision(page, 3);
  await expectStock(page, 'grain', 3);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  await page.unroute('**/commands');

  const other = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
  try {
    const secondPage = await other.newPage();
    await secondPage.goto('/');
    await signIn(secondPage, account.email);
    await secondPage.getByRole('button', { name: /Lantern & Co\./ }).click();
    await expectRevision(secondPage, 3);
    await buy(page, 'Herbs');
    await expectRevision(page, 4);
    await buy(secondPage, 'Herbs');
    await expect(secondPage.getByRole('alert')).toContainText('changed on another device');
    await expectRevision(secondPage, 4);
    await expectStock(secondPage, 'herbs', 1);
    await expectStock(secondPage, 'tea', 0);
  } finally {
    await other.close();
  }

  await activate(page, 'Leave vendor');
  await expectRevision(page, 5);
  await expect(action(page, 'Visit Mill Yard')).toBeDisabled();
  await visit(page, 'Meadow Supply');
  await expectRevision(page, 6);
  await buy(page, 'Cloth');
  await expectRevision(page, 7);
  await buy(page, 'Tea');
  await expectRevision(page, 8);
  await activate(page, 'Compare all vendors');
  await expect(action(page, 'Visit Greenbank Growers')).toBeDisabled();
  await activate(page, 'Finish buying');
  await expectRevision(page, 9);
  await setDisplay(page, WINDOW_SLOT_INDEX, 'grain', 5, 10);
  await setDisplay(page, 0, 'herbs', 8, 11);
  await setDisplay(page, 1, 'cloth', 15, 12);
  await setDisplay(page, 2, 'tea', 20, 13);
  await screenshot(page, info.outputPath('02-preparation.png'));
  const meadowClosing = await serveAndClose(page, 14);
  await screenshot(page, info.outputPath('03-meadow-report.png'));

  await activate(page, 'Begin day 2');
  await expectRevision(page, meadowClosing + 1);
  await chooseTown(page, 'Harbor');
  await expectRevision(page, meadowClosing + 2);
  await visit(page, 'Dockside Lots');
  await expectRevision(page, meadowClosing + 3);
  await buy(page, 'Tea', 2);
  await expectRevision(page, meadowClosing + 4);
  await activate(page, 'Finish buying');
  await expectRevision(page, meadowClosing + 5);
  await setDisplay(page, 2, 'tea', 12, meadowClosing + 6);
  const harborClosing = await serveAndClose(page, meadowClosing + 7);
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
  await expectRevision(page, harborClosing);
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
