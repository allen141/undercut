import { defineConfig, devices } from '@playwright/test';

const softwareWebGL = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const firefoxSoftwareWebGL = { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'webgl.disable-fail-if-major-performance-caveat': true, 'webgl.force_osmesa': true } };

export default defineConfig({
  testDir: './tests',
  timeout: 150_000,
  expect: { timeout: 10_000 },
  // The disposable stack also uses the production API's per-client rate limits.
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5180',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Use reduced motion to keep the rendered scene still during the startup check.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 }, launchOptions: softwareWebGL } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 900 }, launchOptions: firefoxSoftwareWebGL } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], launchOptions: softwareWebGL } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
