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

test.describe('Save on navigate (flush-on-unmount)', () => {
  test('canvas changes persist when navigating away immediately after drawing', async ({
    page,
  }) => {
    await login(page);
    await page.goto(DOC_URL);

    // Wait for the canvas to be ready
    await page.waitForSelector('[data-page-id]', { timeout: 10000 });

    // Ensure we're in Draw mode
    const drawButton = page.getByRole('button', { name: 'Draw' });
    await drawButton.click();
    await page.waitForTimeout(300);

    // Draw a unique stroke (use a distinctive position so we can verify it)
    await drawStroke(page, 100, 800, 300, 800);

    // Navigate to dashboard IMMEDIATELY — no waiting for save
    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard**');

    // Navigate back to the document
    await page.goto(DOC_URL);
    await page.waitForSelector('[data-page-id]', { timeout: 10000 });
    await page.waitForTimeout(1000); // Let canvas render

    // Verify canvas has drawn content (strokes were persisted)
    const strokeCountAfter = await page
      .locator('[data-page-id]')
      .first()
      .locator('canvas')
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return -1;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonWhite = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
            nonWhite++;
          }
        }
        return nonWhite;
      });

    // The stroke should be present after reload — meaning the save completed
    // before/during navigation instead of being discarded
    expect(strokeCountAfter).toBeGreaterThan(0);
  });
});
