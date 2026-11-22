import { expect, test } from '@playwright/test';

test('starts and renders the shop scene on this platform', { tag: '@smoke' }, async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/preview/shop');

  const scene = page.locator('.low-poly-demo');
  await expect(scene).toBeVisible();
  await expect(scene.locator('.low-poly-scene canvas')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
