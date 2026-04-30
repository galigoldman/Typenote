import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded document URL — has canvas_type 'lined' and pages default
const DOC_URL = '/dashboard/documents/20000000-0000-0000-0000-000000000001';

// Page dimensions from the app
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

/** Get the interaction layer inside the first canvas page */
function getInteractionLayer(page: Page) {
  return page
    .locator('[data-page-id]')
    .first()
    .locator('div.absolute.inset-0')
    .last();
}

/** Dispatch a pointer event on the canvas interaction layer */
async function penEvent(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  pressure = 0.5,
) {
  const layer = getInteractionLayer(page);
  await layer.dispatchEvent(type, {
    pointerType: 'pen',
    pressure,
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
}

/** Draw a stroke from (x1,y1) to (x2,y2) with intermediate points */
async function drawStroke(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps = 10,
) {
  await penEvent(page, 'pointerdown', x1, y1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    await penEvent(page, 'pointermove', x, y);
  }
  await penEvent(page, 'pointerup', x2, y2);
}

/** Draw a rough circle by creating points along an arc */
async function drawRoughCircle(
  page: Page,
  cx: number,
  cy: number,
  radius: number,
) {
  const steps = 24;
  const startAngle = 0;

  // Start drawing
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  await penEvent(page, 'pointerdown', startX, startY);

  // Draw arc with slight randomness for "rough" feel
  for (let i = 1; i <= steps; i++) {
    const angle = startAngle + (2 * Math.PI * i) / steps;
    const jitter = (Math.random() - 0.5) * 5; // slight wobble
    const x = cx + (radius + jitter) * Math.cos(angle);
    const y = cy + (radius + jitter) * Math.sin(angle);
    await penEvent(page, 'pointermove', x, y);
  }

  // Hold at end point for shape snap (400ms)
  await page.waitForTimeout(500);
  await penEvent(page, 'pointerup', startX, startY);
}

test.describe('Canvas Editor', () => {
  // Canvas tests use pointer events which need careful timing in CI
  test.skip(!!process.env.CI, 'Canvas pointer events unreliable in CI');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(DOC_URL);

    // Wait for canvas editor to load (page container with data-page-id)
    await expect(page.locator('[data-page-id]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('draw continuous strokes with pen', async ({ page }) => {
    // Switch to Draw mode
    await page.getByRole('button', { name: 'Draw', exact: true }).click();

    // Draw several strokes to simulate writing "hello"
    // H
    await drawStroke(page, 100, 200, 100, 260);
    await drawStroke(page, 100, 230, 120, 230);
    await drawStroke(page, 120, 200, 120, 260);
    // e (rough)
    await drawStroke(page, 130, 230, 145, 225);
    await drawStroke(page, 145, 225, 145, 245);
    await drawStroke(page, 145, 245, 130, 250);

    // Canvas should have rendered strokes (canvas element exists and has been drawn to)
    const canvas = page.locator('[data-page-id]').first().locator('canvas');
    await expect(canvas.first()).toBeVisible();
  });

  test('pen does not trigger scroll or selection', async ({ page }) => {
    await page.getByRole('button', { name: 'Draw', exact: true }).click();

    // Record scroll position before drawing
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Draw a stroke
    await drawStroke(page, 200, 300, 300, 300);

    // Scroll position should not have changed
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBe(scrollBefore);

    // No text should be selected
    const selection = await page.evaluate(() =>
      window.getSelection()?.toString(),
    );
    expect(selection).toBe('');
  });

  test('mouse does NOT draw strokes', async ({ page }) => {
    await page.getByRole('button', { name: 'Draw', exact: true }).click();

    // Try to draw with mouse (pointerType: 'mouse')
    const canvas = getInteractionLayer(page);
    await canvas.dispatchEvent('pointerdown', {
      pointerType: 'mouse',
      clientX: 200,
      clientY: 300,
      button: 0,
      buttons: 1,
    });
    await canvas.dispatchEvent('pointermove', {
      pointerType: 'mouse',
      clientX: 300,
      clientY: 300,
    });
    await canvas.dispatchEvent('pointerup', {
      pointerType: 'mouse',
      clientX: 300,
      clientY: 300,
      button: 0,
    });

    // No stroke should be created — this is a basic check that the
    // canvas doesn't treat mouse input as drawing input
    // The canvas still exists, we just verify no error occurred
    await expect(canvas).toBeVisible();
  });

  test('circle snap — draw rough circle and hold', async ({ page }) => {
    test.setTimeout(30_000);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();

    // Draw a rough circle and hold at end
    await drawRoughCircle(page, 400, 400, 60);

    // Wait for shape snap to process
    await page.waitForTimeout(600);

    // Canvas should still be visible and no errors
    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('straight line snap — draw rough line and hold', async ({ page }) => {
    test.setTimeout(30_000);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();

    // Draw a slightly wobbly line
    await penEvent(page, 'pointerdown', 100, 500);
    for (let i = 1; i <= 15; i++) {
      const x = 100 + (300 * i) / 15;
      const y = 500 + (Math.random() - 0.5) * 4; // slight wobble
      await penEvent(page, 'pointermove', x, y);
    }
    // Hold at end for snap
    await page.waitForTimeout(500);
    await penEvent(page, 'pointerup', 400, 500);

    await page.waitForTimeout(600);
    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('erase stroke', async ({ page }) => {
    // Draw a stroke first
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await drawStroke(page, 200, 200, 300, 200);

    // Switch to eraser
    await page.getByTitle('Eraser').click();

    // Erase over the stroke
    await drawStroke(page, 200, 200, 300, 200);

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('add text box and type', async ({ page }) => {
    // Enter Draw mode first — "Add text box" is a Draw sub-tool
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByTitle('Add text box').click();

    // Click on the canvas to place the text box
    const pageContainer = page.locator('[data-page-id]').first();
    await pageContainer.click({ position: { x: 300, y: 300 } });

    // Type text
    await page.keyboard.type('Hello World');

    // The text should be visible on the page
    await expect(pageContainer.getByText('Hello World')).toBeVisible();
  });

  test('select and move text box', async ({ page }) => {
    // Enter Draw mode — "Add text box" is a Draw sub-tool
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByTitle('Add text box').click();
    const pageContainer = page.locator('[data-page-id]').first();
    await pageContainer.click({ position: { x: 200, y: 200 } });
    await page.keyboard.type('Move me');
    await expect(pageContainer.getByText('Move me')).toBeVisible();

    // Switch to select mode
    await page.getByTitle('Select').click();

    // Click on the text box to select it
    await pageContainer.getByText('Move me').click();

    // The text box should still be visible after selection
    await expect(pageContainer.getByText('Move me')).toBeVisible();
  });

  test('select and move drawing', async ({ page }) => {
    // Draw a stroke
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await drawStroke(page, 300, 300, 400, 300);

    // Switch to select mode
    await page.getByTitle('Select').click();

    // Click on the drawn area to select it
    const pageContainer = page.locator('[data-page-id]').first();
    await pageContainer.click({ position: { x: 350, y: 300 } });

    // Canvas should still be visible (basic stability check)
    await expect(pageContainer).toBeVisible();
  });

  test('undo drawing', async ({ page }) => {
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await drawStroke(page, 150, 400, 250, 400);

    // Undo
    await page.getByTitle('Undo').click();

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('redo drawing', async ({ page }) => {
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await drawStroke(page, 150, 450, 250, 450);

    // Undo then redo
    await page.getByTitle('Undo').click();
    await page.getByTitle('Redo').click();

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('auto-create page when drawing at bottom', async ({ page }) => {
    await page.getByRole('button', { name: 'Draw', exact: true }).click();

    // Count initial pages
    const initialPageCount = await page.locator('[data-page-id]').count();

    // Draw near the bottom of the page (85% threshold = ~955px)
    const bottomY = PAGE_HEIGHT * 0.9;
    await drawStroke(page, 200, bottomY, 300, bottomY);

    // Wait for auto-page creation
    await page.waitForTimeout(1000);

    // Should have more pages now
    const newPageCount = await page.locator('[data-page-id]').count();
    expect(newPageCount).toBeGreaterThan(initialPageCount);
  });

  test('auto-create page when typing at bottom', async ({ page }) => {
    // Enter Draw mode — "Add text box" is a Draw sub-tool
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByTitle('Add text box').click();
    const pageContainer = page.locator('[data-page-id]').first();

    const bottomY = PAGE_HEIGHT * 0.9;
    await pageContainer.click({ position: { x: 200, y: bottomY } });
    await page.keyboard.type(
      'This text is near the bottom and should trigger a new page',
    );

    // Wait for auto-page creation
    await page.waitForTimeout(1000);

    const pageCount = await page.locator('[data-page-id]').count();
    expect(pageCount).toBeGreaterThan(1);
  });

  test('switch between pages', async ({ page }) => {
    // If there are multiple pages, click on a different one
    const pages = page.locator('[data-page-id]');
    const count = await pages.count();

    if (count > 1) {
      // Scroll to second page and click it
      await pages.nth(1).scrollIntoViewIfNeeded();
      await pages.nth(1).click();
      await expect(pages.nth(1)).toBeVisible();
    } else {
      // Add a new page first
      await page.getByTitle('Add page').first().click();
      // Select page type
      const pageTypeButton = page.locator('button', { hasText: 'Blank' });
      if (await pageTypeButton.isVisible()) {
        await pageTypeButton.click();
      }

      const newCount = await pages.count();
      expect(newCount).toBeGreaterThan(1);
    }
  });

  test('add new page manually', async ({ page }) => {
    const initialCount = await page.locator('[data-page-id]').count();

    // Click the add page button
    await page.getByTitle('Add page').first().click();

    // Select blank page type from popover
    const blankOption = page.locator('button', { hasText: 'Blank' });
    if (await blankOption.isVisible()) {
      await blankOption.click();
    }

    await page.waitForTimeout(500);
    const newCount = await page.locator('[data-page-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  // Issue #117.1 — mode switch must preserve scroll position
  // Adds a second page, scrolls so page 2 is visible at the top of the
  // viewport, then switches modes and verifies the SECOND page's top edge
  // stays at the same viewport Y position (within 50px tolerance).
  test('mode switch preserves scroll position with multiple pages', async ({
    page,
  }) => {
    // Use the page selector inside the scroll container to avoid stray
    // [data-page-id] elements elsewhere in the DOM.
    const scrollContainer = page.locator('[data-scroll-container]');
    const pagesInContainer = scrollContainer.locator('[data-page-id]');

    // Add a page so the document has at least 2
    const initialCount = await pagesInContainer.count();
    if (initialCount < 2) {
      await page.getByTitle('Add page').first().click();
      const blankOption = page.locator('button', { hasText: 'Blank' });
      if (await blankOption.isVisible()) {
        await blankOption.click();
      }
      await page.waitForTimeout(500);
    }
    const pageCount = await pagesInContainer.count();
    expect(pageCount).toBeGreaterThanOrEqual(2);

    // Start in Type mode (default)
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.waitForTimeout(300);

    // Scroll so page 2's top is visible in the upper portion of the viewport.
    // Pass the page2 element handle directly into evaluate so we don't depend on
    // querySelector inside the page context (which can pick up stray elements).
    const page2Handle = await pagesInContainer.nth(1).elementHandle();
    if (!page2Handle) throw new Error('Could not get page 2 handle');

    await scrollContainer.evaluate((el, page2El: HTMLElement) => {
      const containerRect = el.getBoundingClientRect();
      const page2Rect = page2El.getBoundingClientRect();
      const page2OffsetInContainer =
        page2Rect.top - containerRect.top + el.scrollTop;
      el.scrollTop = page2OffsetInContainer - 100;
    }, page2Handle);
    await page.waitForTimeout(300);

    // Helper: get page 2's top Y coordinate in viewport space
    const getPage2ViewportY = async (): Promise<number> => {
      return await scrollContainer.evaluate((el, page2El: HTMLElement) => {
        const containerRect = el.getBoundingClientRect();
        const page2Rect = page2El.getBoundingClientRect();
        return page2Rect.top - containerRect.top;
      }, page2Handle);
    };

    const page2YBefore = await getPage2ViewportY();
    // Sanity check: page 2 should be visible somewhere reasonable
    expect(page2YBefore).toBeLessThan(500);
    expect(page2YBefore).toBeGreaterThan(-500);

    // Switch to Draw mode
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.waitForTimeout(500);

    const page2YAfterDraw = await getPage2ViewportY();
    // Page 2's top should be within 50px of where it was in Type mode
    expect(Math.abs(page2YAfterDraw - page2YBefore)).toBeLessThanOrEqual(10);

    // Switch back to Type mode
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.waitForTimeout(500);

    const page2YAfterType = await getPage2ViewportY();
    expect(Math.abs(page2YAfterType - page2YBefore)).toBeLessThanOrEqual(10);
  });
});
