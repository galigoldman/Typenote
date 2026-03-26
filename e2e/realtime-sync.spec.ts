import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// First seeded document for the test user
const TEST_DOC_URL =
  process.env.TEST_DOC_URL ??
  '/dashboard/documents/20000000-0000-0000-0000-000000000001';

function getEditor(page: Page) {
  return page.locator('.ProseMirror');
}

test.describe('Realtime document sync', () => {
  // Realtime sync is slower in CI — give it plenty of time
  test.setTimeout(90_000);

  test('typing in Tab A appears in Tab B with lock indicator', async ({
    browser,
  }) => {
    // Create fresh contexts per attempt so retries don't inherit stale state
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Log in on both contexts
      await Promise.all([login(pageA), login(pageB)]);

      // Navigate both tabs to the same document
      await Promise.all([pageA.goto(TEST_DOC_URL), pageB.goto(TEST_DOC_URL)]);

      // Wait for editors to load
      await expect(getEditor(pageA)).toBeVisible();
      await expect(getEditor(pageB)).toBeVisible();

      // Wait for realtime connection (green dot)
      await expect(pageA.locator('text=Synced')).toBeVisible({
        timeout: 15_000,
      });
      await expect(pageB.locator('text=Synced')).toBeVisible({
        timeout: 15_000,
      });

      // Type in Tab A
      const testText = `sync-test-${Date.now()}`;
      await getEditor(pageA).click();
      await pageA.keyboard.press('End');
      await pageA.keyboard.press('Enter');
      await pageA.keyboard.type(testText);

      // Wait for debounce (800ms) + network round trip — CI is slower
      await pageA.waitForTimeout(5000);

      // Verify the text appears in Tab B
      await expect(getEditor(pageB)).toContainText(testText, {
        timeout: 30_000,
      });

      // Verify Tab B shows the lock indicator
      await expect(pageB.locator('text=Editing elsewhere')).toBeVisible();
      await expect(pageB.locator('text=Take over editing')).toBeVisible();

      // Click "Take over" on Tab B and verify editor becomes editable
      await pageB.locator('text=Take over editing').click();
      await expect(pageB.locator('text=Editing elsewhere')).not.toBeVisible();
      await expect(pageB.locator('text=Synced')).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
