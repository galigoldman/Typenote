import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import * as path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '..', 'extension');
const EXPECTED_VERSION = '0.2.1';
const PINNED_EXTENSION_ID = 'beajdnpmcbgjfkhojoangknkeimimmfm';
// CI's webServer serves on localhost:3000; locally override via PLAYWRIGHT_BASE_URL
// to point at a deployed instance.
const DASHBOARD_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

async function launchWithExtension(): Promise<BrowserContext> {
  const args = [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  // Linux CI runners have no X server; Chrome's new headless mode is the only
  // way to run MV3 extensions without a display (old --headless skips them).
  if (process.env.CI) args.push('--headless=new');

  return await chromium.launchPersistentContext('', {
    headless: false,
    args,
  });
}

async function getServiceWorker(context: BrowserContext) {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  }
  return sw;
}

// Service worker registration sometimes takes longer than the 30s default.
test.setTimeout(60_000);

test.describe.configure({ mode: 'serial' });

test.describe('Typenote Moodle Extension — real extension load', () => {
  test('service worker registers with the pinned extension ID', async () => {
    const context = await launchWithExtension();
    try {
      const sw = await getServiceWorker(context);
      const swUrl = new URL(sw.url());
      expect(swUrl.protocol).toBe('chrome-extension:');
      expect(swUrl.hostname).toBe(PINNED_EXTENSION_ID);
    } finally {
      await context.close();
    }
  });

  test('PING from an allowed origin returns version 0.2.1', async () => {
    const context = await launchWithExtension();
    try {
      const sw = await getServiceWorker(context);
      const extensionId = new URL(sw.url()).hostname;

      const page = await context.newPage();

      // Manifest's externally_connectable allows http://localhost:3000/*.
      // Intercept that URL and serve a page that runs chrome.runtime.sendMessage,
      // so the request's origin satisfies the manifest without a real server.
      await context.route('http://localhost:3000/__test', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!doctype html><html><body><script>
            window.__pingResult = null;
            window.__pingError = null;
            try {
              chrome.runtime.sendMessage(
                ${JSON.stringify(extensionId)},
                { type: 'PING' },
                (response) => {
                  if (chrome.runtime.lastError) {
                    window.__pingError = chrome.runtime.lastError.message;
                  } else {
                    window.__pingResult = response;
                  }
                }
              );
            } catch (e) {
              window.__pingError = String(e);
            }
          </script></body></html>`,
        });
      });

      await page.goto('http://localhost:3000/__test', { timeout: 10_000 });
      await page.waitForFunction(
        () => {
          type W = { __pingResult?: unknown; __pingError?: unknown };
          const w = window as unknown as W;
          return w.__pingResult !== null || w.__pingError !== null;
        },
        undefined,
        { timeout: 10_000 },
      );

      const result = await page.evaluate(() => ({
        ok: (window as unknown as { __pingResult?: unknown }).__pingResult,
        err: (window as unknown as { __pingError?: unknown }).__pingError,
      }));

      expect(result.err).toBeNull();
      expect(result.ok).toEqual({
        success: true,
        data: { version: EXPECTED_VERSION },
      });
    } finally {
      await context.close();
    }
  });

  test('remote dashboard recognizes the extension after login', async () => {
    const context = await launchWithExtension();
    try {
      // Service worker must be up before the dashboard pings it.
      await getServiceWorker(context);

      // Headless Chromium reports `pointer: coarse` (no physical mouse), which
      // makes useExtensionPlatform() gate the Moodle card OUT. Force the
      // pointer-fine match so the card renders on headless CI runs.
      await context.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (query: string) => {
          if (query.includes('pointer: fine')) {
            return {
              matches: true,
              media: query,
              addEventListener: () => {},
              removeEventListener: () => {},
              addListener: () => {},
              removeListener: () => {},
              dispatchEvent: () => false,
              onchange: null,
            } as MediaQueryList;
          }
          return real(query);
        };
      });

      const page = await context.newPage();
      await page.goto(`${DASHBOARD_BASE_URL}/login`);
      await page.getByLabel('Email').fill('test@typenote.dev');
      await page.getByLabel('Password').fill('Test1234');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL('**/dashboard**', { timeout: 15_000 });

      // The card title is always present; the body distinguishes states.
      // 'not-installed' shows the "Install Extension" disabled button.
      // 'installed' shows either MoodleConnectionSetup or "Sync with Moodle".
      await expect(page.getByText(/moodle integration/i).first()).toBeVisible({
        timeout: 10_000,
      });
      // The skeleton resolves within ~2s (PING_TIMEOUT_MS). Wait for either
      // a real installed state or a definitive not-installed state.
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return (
            /install extension/i.test(text) ||
            /sync with moodle/i.test(text) ||
            /enter your moodle url/i.test(text) ||
            /update extension/i.test(text)
          );
        },
        undefined,
        { timeout: 10_000 },
      );

      const installButtonCount = await page
        .getByRole('button', { name: /^install extension$/i })
        .count();
      const updateButtonCount = await page
        .getByRole('button', { name: /^update extension$/i })
        .count();

      expect(installButtonCount).toBe(0); // would mean not-installed
      expect(updateButtonCount).toBe(0); // would mean version-mismatch
    } finally {
      await context.close();
    }
  });
});
