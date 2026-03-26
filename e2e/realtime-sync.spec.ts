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
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeAll(async ({ browser }) => {
    // Create two separate browser contexts (simulating two tabs/devices)
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    // Log in on both contexts
    await Promise.all([login(pageA), login(pageB)]);
  });

  test.afterAll(async () => {
    await contextA.close();
    await contextB.close();
  });

  test('typing in Tab A appears in Tab B with lock indicator', async () => {
    // Navigate both tabs to the same document
    await Promise.all([pageA.goto(TEST_DOC_URL), pageB.goto(TEST_DOC_URL)]);

    // Wait for editors to load
    await expect(getEditor(pageA)).toBeVisible();
    await expect(getEditor(pageB)).toBeVisible();

    // Wait for realtime connection (green dot)
    await expect(pageA.locator('text=Synced')).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator('text=Synced')).toBeVisible({ timeout: 10000 });

    // Type in Tab A
    const testText = `sync-test-${Date.now()}`;
    await getEditor(pageA).click();
    await pageA.keyboard.press('End');
    await pageA.keyboard.press('Enter');
    await pageA.keyboard.type(testText);

    // Wait for debounce (800ms) + network round trip
    await pageA.waitForTimeout(3000);

    // Verify the text appears in Tab B
    await expect(getEditor(pageB)).toContainText(testText, {
      timeout: 10000,
    });

    // Verify Tab B shows the lock indicator
    await expect(pageB.locator('text=Editing elsewhere')).toBeVisible();
    await expect(pageB.locator('text=Take over editing')).toBeVisible();

    // Click "Take over" on Tab B and verify editor becomes editable
    await pageB.locator('text=Take over editing').click();
    await expect(pageB.locator('text=Editing elsewhere')).not.toBeVisible();
    await expect(pageB.locator('text=Synced')).toBeVisible();
  });
});
