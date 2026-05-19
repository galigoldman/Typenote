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
    // Stub window.chrome with the Chrome-family globals (loadTimes/csi/app)
    // that useExtensionPlatform() uses for Chromium detection. We deliberately
    // omit `runtime` here — that field is only injected once the extension is
    // installed and lists the page in externally_connectable, so the gate must
    // work without it (otherwise the install card itself is unreachable).
    await context.addInitScript(() => {
      Object.defineProperty(window, 'chrome', {
        value: {
          loadTimes: () => ({}),
          csi: () => ({}),
          app: {},
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
