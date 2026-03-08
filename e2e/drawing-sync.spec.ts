import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Drawing sync E2E tests.
 *
 * These tests verify that drawing blocks persist across page reloads and
 * save/reload cycles. They require the same environment as realtime-sync tests:
 *
 * 1. A running Supabase instance (local or remote)
 * 2. A valid test user account
 * 3. At least one document created for the test user
 *
 * Set the following environment variables before running:
 *   TEST_USER_EMAIL    - email for the test account
 *   TEST_USER_PASSWORD - password for the test account
 *   TEST_DOC_URL       - full path to the document page, e.g. /dashboard/documents/<uuid>
 *
 * Run with: TEST_USER_EMAIL=... TEST_USER_PASSWORD=... TEST_DOC_URL=... pnpm test:e2e -- drawing-sync
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
const TEST_DOC_URL = process.env.TEST_DOC_URL ?? '';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard**');
}

function getEditor(page: Page) {
  return page.locator('.ProseMirror');
}

// Helper: click a toolbar button by its aria-label
async function clickToolbarButton(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('Drawing block sync / persistence', () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD || !TEST_DOC_URL,
    'Skipping: TEST_USER_EMAIL, TEST_USER_PASSWORD, and TEST_DOC_URL env vars required',
  );

  let contextA: BrowserContext;
  let pageA: Page;

  test.beforeAll(async ({ browser }) => {
    // Create a browser context to simulate a logged-in user
    contextA = await browser.newContext();
    pageA = await contextA.newPage();
    await login(pageA);
  });

  test.afterAll(async () => {
    await contextA.close();
  });

  test('a drawing block inserted in one tab appears after page reload', async () => {
    // Navigate to the document
    await pageA.goto(TEST_DOC_URL);
    await expect(getEditor(pageA)).toBeVisible();

    // Wait for sync connection
    await expect(pageA.locator('text=Synced')).toBeVisible({
      timeout: 10000,
    });

    // Focus editor and insert a drawing block
    await getEditor(pageA).click();
    await pageA.keyboard.press('End');
    await pageA.keyboard.press('Enter');
    await clickToolbarButton(pageA, 'Insert drawing');

    // Verify the drawing block is present
    const drawingBlock = pageA.locator('[data-type="drawing-block"]');
    await expect(drawingBlock).toBeVisible();

    // Wait for the debounce save to complete (800ms debounce + network)
    await pageA.waitForTimeout(3000);

    // Reload the page
    await pageA.reload();
    await expect(getEditor(pageA)).toBeVisible();

    // Wait for editor content to fully load after reload
    await expect(pageA.locator('text=Synced')).toBeVisible({
      timeout: 10000,
    });

    // The drawing block should still be present after reload
    const drawingBlockAfterReload = pageA.locator(
      '[data-type="drawing-block"]',
    );
    await expect(drawingBlockAfterReload).toBeVisible({ timeout: 10000 });
  });

  test('drawing block data persists across save/reload cycles', async () => {
    // Navigate to the document
    await pageA.goto(TEST_DOC_URL);
    await expect(getEditor(pageA)).toBeVisible();

    // Wait for sync connection
    await expect(pageA.locator('text=Synced')).toBeVisible({
      timeout: 10000,
    });

    // Focus editor and insert a drawing block
    await getEditor(pageA).click();
    await pageA.keyboard.press('End');
    await pageA.keyboard.press('Enter');
    await clickToolbarButton(pageA, 'Insert drawing');

    // Verify the drawing block appears
    const drawingBlock = pageA.locator('[data-type="drawing-block"]');
    await expect(drawingBlock).toBeVisible();

    // Count how many drawing blocks exist so we can verify the count persists
    const drawingBlockCount = await drawingBlock.count();
    expect(drawingBlockCount).toBeGreaterThanOrEqual(1);

    // Wait for save to complete
    await pageA.waitForTimeout(3000);

    // Navigate away from the document entirely
    await pageA.goto('/dashboard');
    await pageA.waitForURL('**/dashboard**');

    // Navigate back to the document
    await pageA.goto(TEST_DOC_URL);
    await expect(getEditor(pageA)).toBeVisible();

    // Wait for content to load
    await expect(pageA.locator('text=Synced')).toBeVisible({
      timeout: 10000,
    });

    // Verify drawing blocks persist — at least as many as we counted before
    const drawingBlockAfterReturn = pageA.locator(
      '[data-type="drawing-block"]',
    );
    await expect(drawingBlockAfterReturn.first()).toBeVisible({
      timeout: 10000,
    });
    const countAfterReturn = await drawingBlockAfterReturn.count();
    expect(countAfterReturn).toBeGreaterThanOrEqual(drawingBlockCount);
  });
});
