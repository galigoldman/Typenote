import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Keyboard shortcuts for the canvas editor (Tier 1 editor-parity fixes):
 *  - Ctrl/Cmd+Z undo and Ctrl/Cmd+Shift+Z / Ctrl+Y redo, wired to the canvas
 *    history stack (the canvas has no native browser undo).
 *  - Ctrl/Cmd+A selects every object on the page in select mode.
 *
 * Like the other canvas-pointer specs (canvas-editor, drawing-copy-paste), these
 * dispatch synthetic pen pointer events, which are unreliable under the headless
 * CI runner — so they run locally only, matching the established pattern.
 */

const DOC_URL = '/dashboard/documents/20000000-0000-0000-0000-000000000001';

function getInteractionLayer(page: Page) {
  return page
    .locator('[data-page-id]')
    .first()
    .locator('div.absolute.inset-0')
    .last();
}

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
    await penEvent(page, 'pointermove', x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
  }
  await penEvent(page, 'pointerup', x2, y2);
}

async function switchToDraw(page: Page) {
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await page.waitForTimeout(200);
}

async function switchToSelect(page: Page) {
  await page.locator('button[title="Select"]').click();
  await page.waitForTimeout(200);
}

const undoBtn = (page: Page) => page.getByTitle('Undo');
const redoBtn = (page: Page) => page.getByTitle('Redo');

const STROKE_Y = 400;

test.describe('Canvas Editor — keyboard shortcuts', () => {
  test.skip(!!process.env.CI, 'Canvas pointer events unreliable in CI');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(DOC_URL);
    await expect(page.locator('[data-page-id]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Ctrl+Z undoes a stroke from the keyboard (draw mode)', async ({
    page,
  }) => {
    await switchToDraw(page);
    // Nothing drawn yet → Undo disabled.
    await expect(undoBtn(page)).toBeDisabled();

    await drawStroke(page, 250, STROKE_Y, 400, STROKE_Y);
    // A stroke is on the history stack → Undo enabled.
    await expect(undoBtn(page)).toBeEnabled();

    await page.keyboard.press('Control+z');
    // Keyboard undo emptied the stack → Undo disabled again.
    await expect(undoBtn(page)).toBeDisabled();
  });

  test('Ctrl+Shift+Z redoes after a keyboard undo', async ({ page }) => {
    await switchToDraw(page);
    await drawStroke(page, 250, STROKE_Y + 40, 400, STROKE_Y + 40);
    await expect(undoBtn(page)).toBeEnabled();

    await page.keyboard.press('Control+z');
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeEnabled();

    await page.keyboard.press('Control+Shift+z');
    // Redo restored the stroke → Undo enabled, Redo exhausted.
    await expect(undoBtn(page)).toBeEnabled();
    await expect(redoBtn(page)).toBeDisabled();
  });

  test('Ctrl+Y also redoes (Windows convention)', async ({ page }) => {
    await switchToDraw(page);
    await drawStroke(page, 250, STROKE_Y + 80, 400, STROKE_Y + 80);
    await page.keyboard.press('Control+z');
    await expect(redoBtn(page)).toBeEnabled();

    await page.keyboard.press('Control+y');
    await expect(redoBtn(page)).toBeDisabled();
    await expect(undoBtn(page)).toBeEnabled();
  });

  test('Ctrl+A selects all objects in select mode, then Delete removes them', async ({
    page,
  }) => {
    await switchToDraw(page);
    await drawStroke(page, 250, STROKE_Y, 400, STROKE_Y);
    await switchToSelect(page);

    // No selection yet.
    await expect(page.getByTestId('canvas-selection')).toHaveCount(0);

    await page.keyboard.press('Control+a');
    // Select-all produced a selection bounding box.
    await expect(page.getByTestId('canvas-selection').first()).toBeVisible();

    await page.keyboard.press('Delete');
    // Selection cleared after delete; canvas remains stable.
    await expect(page.getByTestId('canvas-selection')).toHaveCount(0);
    await expect(page.locator('[data-page-id]').first()).toBeVisible();

    // The delete is itself undoable from the keyboard.
    await expect(undoBtn(page)).toBeEnabled();
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-page-id]').first()).toBeVisible();
  });
});
