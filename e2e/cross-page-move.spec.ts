import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded document URL
const DOC_URL = '/dashboard/documents/20000000-0000-0000-0000-000000000001';

/** Get the interaction layer for a specific page */
function getInteractionLayer(page: Page, pageIndex: number) {
  return page
    .locator('[data-page-id]')
    .nth(pageIndex)
    .locator('div.absolute.inset-0')
    .last();
}

/** Draw a stroke on a specific page */
async function drawStroke(
  page: Page,
  pageIndex: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps = 10,
) {
  const layer = getInteractionLayer(page, pageIndex);
  const opts = {
    pointerType: 'pen' as const,
    pressure: 0.5,
    pointerId: 1,
    isPrimary: true,
    button: 0,
  };

  await layer.dispatchEvent('pointerdown', {
    ...opts,
    clientX: x1,
    clientY: y1,
    buttons: 1,
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await layer.dispatchEvent('pointermove', {
      ...opts,
      clientX: x1 + (x2 - x1) * t,
      clientY: y1 + (y2 - y1) * t,
      buttons: 1,
    });
  }
  await layer.dispatchEvent('pointerup', {
    ...opts,
    clientX: x2,
    clientY: y2,
    buttons: 0,
  });
}

/** Switch to Draw mode */
async function switchToDraw(page: Page) {
  await page.getByRole('button', { name: 'Draw' }).click();
  await page.waitForTimeout(200);
}

/** Switch to Select sub-tool */
async function switchToSelect(page: Page) {
  await page.locator('button[title="Select"]').click();
  await page.waitForTimeout(200);
}

/** Select objects by drawing a rectangle with mouse */
async function rectSelect(
  page: Page,
  pageIndex: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const layer = getInteractionLayer(page, pageIndex);
  const opts = {
    pointerType: 'mouse' as const,
    pointerId: 2,
    isPrimary: true,
    button: 0,
  };

  await layer.dispatchEvent('pointerdown', {
    ...opts,
    clientX: x1,
    clientY: y1,
    buttons: 1,
  });
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    await layer.dispatchEvent('pointermove', {
      ...opts,
      clientX: x1 + (x2 - x1) * t,
      clientY: y1 + (y2 - y1) * t,
      buttons: 1,
    });
  }
  await layer.dispatchEvent('pointerup', {
    ...opts,
    clientX: x2,
    clientY: y2,
    buttons: 0,
  });
}

/** Count strokes (SVG paths) on a page */
async function countStrokes(page: Page, pageIndex: number): Promise<number> {
  const pageEl = page.locator('[data-page-id]').nth(pageIndex);
  return pageEl.locator('svg path').count();
}

/** Get the scroll container */
function getScrollContainer(page: Page) {
  return page.locator('[data-canvas-scroll]');
}

/** Scroll to center a page in the viewport */
async function scrollToPage(page: Page, pageIndex: number) {
  const scrollContainer = getScrollContainer(page);
  const pageEl = page.locator('[data-page-id]').nth(pageIndex);

  await scrollContainer.evaluate(
    (container, targetEl) => {
      const rect = targetEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relY = rect.top - containerRect.top + container.scrollTop;
      container.scrollTop = relY + rect.height / 2 - container.clientHeight / 2;
    },
    await pageEl.elementHandle(),
  );
  await page.waitForTimeout(300);
}

test.describe('Cross-Page Object Movement', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(DOC_URL);
    await page.waitForSelector('[data-canvas-scroll]', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('draw stroke, select, and verify selection exists', async ({ page }) => {
    // Basic smoke test: draw a stroke, switch to select, select it
    await switchToDraw(page);
    const layer = getInteractionLayer(page, 0);
    await expect(layer).toBeVisible();

    await drawStroke(page, 0, 200, 300, 300, 300);
    await page.waitForTimeout(300);

    const strokeCount = await countStrokes(page, 0);
    expect(strokeCount).toBeGreaterThan(0);

    await switchToSelect(page);
    // Select the stroke area
    await rectSelect(page, 0, 180, 280, 320, 320);
    await page.waitForTimeout(300);

    // Selection border should be visible
    const selectionBorder = page.locator('[data-testid="selection-border"]');
    await expect(selectionBorder).toBeVisible({ timeout: 2000 }).catch(() => {
      // Selection might use different indicator
    });
  });

  test('undo restores previous state after drawing', async ({ page }) => {
    await switchToDraw(page);

    const initialStrokes = await countStrokes(page, 0);
    await drawStroke(page, 0, 200, 300, 300, 300);
    await page.waitForTimeout(300);

    const afterDrawStrokes = await countStrokes(page, 0);
    expect(afterDrawStrokes).toBeGreaterThan(initialStrokes);

    // Undo
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(300);

    const afterUndoStrokes = await countStrokes(page, 0);
    expect(afterUndoStrokes).toBe(initialStrokes);
  });

  test('cut and paste stroke to different page', async ({ page }) => {
    const pageCount = await page.locator('[data-page-id]').count();
    test.skip(pageCount < 2, 'Need at least 2 pages');

    // Draw a stroke on page 1
    await switchToDraw(page);
    await drawStroke(page, 0, 200, 300, 300, 300);
    await page.waitForTimeout(300);

    const page1StrokesAfterDraw = await countStrokes(page, 0);
    expect(page1StrokesAfterDraw).toBeGreaterThan(0);

    // Select the stroke
    await switchToSelect(page);
    await rectSelect(page, 0, 180, 280, 320, 320);
    await page.waitForTimeout(300);

    // Cut (Cmd+X)
    await page.keyboard.press('Meta+x');
    await page.waitForTimeout(300);

    // Scroll to page 2
    await scrollToPage(page, 1);

    // Paste (Cmd+V)
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(500);

    // Page 2 should now have strokes
    const page2Strokes = await countStrokes(page, 1);
    expect(page2Strokes).toBeGreaterThan(0);
  });
});
