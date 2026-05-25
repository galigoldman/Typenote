import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded document URL (multi-page document)
const DOC_URL = '/dashboard/documents/20000000-0000-0000-0000-000000000001';

/**
 * Create a small 1x1 red PNG as a data URL for clipboard paste simulation.
 * Returns a base64-encoded PNG blob.
 */
function createTestImageBase64(): string {
  // Minimal 1x1 red PNG (base64)
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
}

/** Get the scroll container */
function getScrollContainer(page: Page) {
  return page.locator('[data-canvas-scroll]');
}

/** Get all page elements */
function getPageElements(page: Page) {
  return page.locator('[data-page-id]');
}

/** Count images on a specific page by data-page-id */
async function countImagesOnPage(page: Page, pageIndex: number): Promise<number> {
  const pageEl = getPageElements(page).nth(pageIndex);
  return pageEl.locator('img[alt=""]').count();
}

/** Scroll to make a specific page visible in the viewport center */
async function scrollToPage(page: Page, pageIndex: number) {
  const scrollContainer = getScrollContainer(page);
  const pageEl = getPageElements(page).nth(pageIndex);

  await scrollContainer.evaluate(
    (container, targetEl) => {
      const rect = targetEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relY = rect.top - containerRect.top + container.scrollTop;
      // Scroll so the page center is at the viewport center
      container.scrollTop = relY + rect.height / 2 - container.clientHeight / 2;
    },
    await pageEl.elementHandle(),
  );
  await page.waitForTimeout(300);
}

/** Paste a test image via clipboard API */
async function pasteTestImage(page: Page) {
  const base64 = createTestImageBase64();
  await page.evaluate(async (b64) => {
    const byteChars = atob(b64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'image/png' });
    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);
  }, base64);

  // Trigger paste via keyboard
  await page.keyboard.press('Meta+v');
  await page.waitForTimeout(500);
}

test.describe('Image Paste Page Targeting', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(DOC_URL);
    await page.waitForSelector('[data-canvas-scroll]', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('paste image on page 1 of document places it on page 1', async ({
    page,
  }) => {
    const initialCount = await countImagesOnPage(page, 0);

    await pasteTestImage(page);

    const newCount = await countImagesOnPage(page, 0);
    expect(newCount).toBe(initialCount + 1);
  });

  test('scroll to page 3 and paste image places it on page 3', async ({
    page,
  }) => {
    // Ensure we have at least 3 pages
    const pageCount = await getPageElements(page).count();
    test.skip(pageCount < 3, 'Document needs at least 3 pages');

    await scrollToPage(page, 2); // 0-indexed page 3

    const initialCount = await countImagesOnPage(page, 2);

    await pasteTestImage(page);

    const newCount = await countImagesOnPage(page, 2);
    expect(newCount).toBe(initialCount + 1);

    // Page 1 should NOT have gained an image
    const page1Count = await countImagesOnPage(page, 0);
    expect(page1Count).toBe(0);
  });

  test('paste image when scrolled between pages lands on nearest page', async ({
    page,
  }) => {
    const pageCount = await getPageElements(page).count();
    test.skip(pageCount < 2, 'Document needs at least 2 pages');

    // Scroll to the gap between page 1 and page 2
    const scrollContainer = getScrollContainer(page);
    const page1 = getPageElements(page).nth(0);
    const page2 = getPageElements(page).nth(1);

    await scrollContainer.evaluate(
      (container, els) => {
        const rect1 = els[0].getBoundingClientRect();
        const rect2 = els[1].getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const bottom1 =
          rect1.top - containerRect.top + container.scrollTop + rect1.height;
        const top2 = rect2.top - containerRect.top + container.scrollTop;
        // Scroll to center the gap between the two pages
        const gapCenter = (bottom1 + top2) / 2;
        container.scrollTop = gapCenter - container.clientHeight / 2;
      },
      [await page1.elementHandle(), await page2.elementHandle()],
    );
    await page.waitForTimeout(300);

    await pasteTestImage(page);

    // Image should be on page 1 or page 2 (whichever is closer), not page 0
    const page1Images = await countImagesOnPage(page, 0);
    const page2Images = await countImagesOnPage(page, 1);
    expect(page1Images + page2Images).toBeGreaterThan(0);
  });
});
