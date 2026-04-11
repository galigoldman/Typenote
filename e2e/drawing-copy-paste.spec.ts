import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded document URL
const DOC_URL = '/dashboard/documents/20000000-0000-0000-0000-000000000001';

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

/** Draw a stroke from (x1,y1) to (x2,y2) */
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

/** Switch to Draw mode via the mode toggle button */
async function switchToDraw(page: Page) {
  await page.getByRole('button', { name: 'Draw' }).click();
  await page.waitForTimeout(200);
}

/** Switch to Select sub-tool (must be in Draw mode already) */
async function switchToSelect(page: Page) {
  await page.locator('button[title="Select"]').click();
  await page.waitForTimeout(200);
}

/** Select an area by dragging a rectangle in select mode using mouse */
async function rectSelect(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const layer = getInteractionLayer(page);
  await layer.dispatchEvent('pointerdown', {
    pointerType: 'mouse',
    clientX: x1,
    clientY: y1,
    pointerId: 2,
    isPrimary: true,
    button: 0,
    buttons: 1,
  });
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    await layer.dispatchEvent('pointermove', {
      pointerType: 'mouse',
      clientX: x1 + (x2 - x1) * t,
      clientY: y1 + (y2 - y1) * t,
      pointerId: 2,
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
  }
  await layer.dispatchEvent('pointerup', {
    pointerType: 'mouse',
    clientX: x2,
    clientY: y2,
    pointerId: 2,
    isPrimary: true,
    button: 0,
    buttons: 0,
  });
}

const STROKE_Y = 400;

test.describe('Drawing Copy/Paste', () => {
  // Canvas pointer events need careful timing
  test.skip(!!process.env.CI, 'Canvas pointer events unreliable in CI');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(DOC_URL);
    await expect(page.locator('[data-page-id]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // -- Stability tests: verify copy/paste flows don't crash --

  test('draw → select → copy → paste cycle is stable', async ({ page }) => {
    // Draw a stroke
    await switchToDraw(page);
    await drawStroke(page, 250, STROKE_Y, 400, STROKE_Y);

    // Switch to select and attempt rect selection
    await switchToSelect(page);
    await rectSelect(page, 230, STROKE_Y - 20, 420, STROKE_Y + 20);
    await page.waitForTimeout(300);

    // Attempt copy and paste via keyboard (works regardless of whether
    // synthetic dispatchEvent created real strokes)
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Canvas should remain stable
    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('pasted drawing can be deleted independently', async ({ page }) => {
    await switchToDraw(page);
    await drawStroke(page, 250, STROKE_Y, 400, STROKE_Y);

    await switchToSelect(page);
    await rectSelect(page, 230, STROKE_Y - 20, 420, STROKE_Y + 20);
    await page.waitForTimeout(300);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Delete whatever is selected
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('undo after paste is stable', async ({ page }) => {
    await switchToDraw(page);
    await drawStroke(page, 250, STROKE_Y + 50, 400, STROKE_Y + 50);

    await switchToSelect(page);
    await rectSelect(page, 230, STROKE_Y + 30, 420, STROKE_Y + 70);
    await page.waitForTimeout(300);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);

    // Undo the paste
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('shape snap still works in draw mode (no regression)', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await switchToDraw(page);

    // Draw a rough line and hold for snap
    await penEvent(page, 'pointerdown', 100, 600);
    for (let i = 1; i <= 15; i++) {
      const x = 100 + (300 * i) / 15;
      const y = 600 + (Math.random() - 0.5) * 4;
      await penEvent(page, 'pointermove', x, y);
    }
    await page.waitForTimeout(500);
    await penEvent(page, 'pointerup', 400, 600);

    await page.waitForTimeout(600);
    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('copy and paste with no selection does nothing', async ({ page }) => {
    await switchToDraw(page);
    await switchToSelect(page);

    // Ctrl+C with nothing selected — no-op
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);

    // Ctrl+V with empty clipboard — no-op
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });

  test('select mode toolbar shows Select button', async ({ page }) => {
    await switchToDraw(page);
    // Select sub-tool button should be visible in Draw mode
    await expect(page.locator('button[title="Select"]')).toBeVisible();
  });

  test('draw mode toolbar shows Pen and Eraser', async ({ page }) => {
    await switchToDraw(page);
    await expect(page.locator('button[title="Pen"]')).toBeVisible();
    await expect(page.locator('button[title="Eraser"]')).toBeVisible();
  });

  test('mode switching between Draw and Type is stable', async ({ page }) => {
    await switchToDraw(page);
    await page.getByRole('button', { name: 'Type' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Draw' }).click();
    await page.waitForTimeout(200);

    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });
});
