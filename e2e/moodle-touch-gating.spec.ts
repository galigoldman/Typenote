import { test, expect, devices } from '@playwright/test';
import { login } from './helpers/auth';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const MOODLE_CARD_TEXT = /moodle integration/i;

test.describe('Moodle UI — touch / non-Chromium gating', () => {
  test('Moodle card is hidden on iPad viewport (pointer: coarse)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices['iPad Pro 11'],
      baseURL: BASE_URL,
    });
    const page = await context.newPage();
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(MOODLE_CARD_TEXT)).toHaveCount(0);

    await context.close();
  });

  test('Moodle card is visible on desktop viewport (pointer: fine)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      baseURL: BASE_URL,
    });
    // Stub window.chrome.runtime.sendMessage so useExtensionPlatform() sees a
    // Chromium-family desktop environment. Without an actual Chrome extension
    // loaded, Playwright's Chromium does not expose window.chrome at all.
    await context.addInitScript(() => {
      Object.defineProperty(window, 'chrome', {
        value: {
          runtime: {
            sendMessage: () => {},
          },
        },
        writable: true,
      });
    });
    const page = await context.newPage();
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Either the install card, update card, or connected card — any state is fine.
    await expect(page.getByText(MOODLE_CARD_TEXT)).toBeVisible();

    await context.close();
  });
});
