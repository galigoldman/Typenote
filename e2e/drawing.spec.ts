import { test, expect, type Page } from '@playwright/test';

const EDITOR_URL = '/test/editor';

// Helper: get the Tiptap ProseMirror editor element
function getEditor(page: Page) {
  return page.locator('.ProseMirror');
}

// Helper: click a toolbar button by its aria-label
async function clickToolbarButton(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('Drawing block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    // Wait for the Tiptap editor to mount
    await expect(getEditor(page)).toBeVisible();
  });

  test('Insert drawing toolbar button exists', async ({ page }) => {
    const insertBtn = page.getByRole('button', {
      name: 'Insert drawing',
      exact: true,
    });
    await expect(insertBtn).toBeVisible();
  });

  test('clicking Insert drawing inserts a drawing block', async ({ page }) => {
    const editor = getEditor(page);
    await editor.click();

    await clickToolbarButton(page, 'Insert drawing');

    // A drawing block node view should now be present in the DOM
    const drawingBlock = page.locator('[data-type="drawing-block"]');
    await expect(drawingBlock).toBeVisible();
  });

  test('drawing block can be deleted via Backspace', async ({ page }) => {
    const editor = getEditor(page);
    await editor.click();

    // Insert a drawing block
    await clickToolbarButton(page, 'Insert drawing');
    const drawingBlock = page.locator('[data-type="drawing-block"]');
    await expect(drawingBlock).toBeVisible();

    // Click the drawing block to select it (Tiptap selects atom nodes on click)
    await drawingBlock.click();

    // Press Backspace to delete the selected node
    await page.keyboard.press('Backspace');

    // The drawing block should no longer exist
    await expect(drawingBlock).toHaveCount(0);
  });
});

test.describe('Mode toggle (Draw / Text)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    // Wait for the Tiptap editor to mount
    await expect(getEditor(page)).toBeVisible();
  });

  test('Draw/Text toggle button exists in the editor header', async ({
    page,
  }) => {
    // In text mode the button reads "Draw" with aria-label "Switch to draw mode"
    const toggleBtn = page.getByRole('button', {
      name: 'Switch to draw mode',
    });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('Draw');
  });

  test('clicking the toggle changes the label from Draw to Text and back', async ({
    page,
  }) => {
    // Initially in text mode — button shows "Draw"
    const drawBtn = page.getByRole('button', {
      name: 'Switch to draw mode',
    });
    await expect(drawBtn).toBeVisible();
    await expect(drawBtn).toContainText('Draw');

    // Click to enter draw mode — button should now show "Text"
    await drawBtn.click();

    const textBtn = page.getByRole('button', {
      name: 'Switch to text mode',
    });
    await expect(textBtn).toBeVisible();
    await expect(textBtn).toContainText('Text');

    // Click again to return to text mode — button should show "Draw" again
    await textBtn.click();

    await expect(drawBtn).toBeVisible();
    await expect(drawBtn).toContainText('Draw');
  });

  test('toggling modes does not corrupt editor content', async ({ page }) => {
    const editor = getEditor(page);

    // Type some identifiable text
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const testText = 'mode-toggle-test-content';
    await page.keyboard.type(testText);

    // Verify text is present
    await expect(editor).toContainText(testText);

    // Toggle to draw mode
    await page.getByRole('button', { name: 'Switch to draw mode' }).click();

    // Verify text still exists while in draw mode
    await expect(editor).toContainText(testText);
    // Also verify original content is preserved
    await expect(editor).toContainText('Hello world');

    // Toggle back to text mode
    await page.getByRole('button', { name: 'Switch to text mode' }).click();

    // Verify text is still intact after toggling back
    await expect(editor).toContainText(testText);
    await expect(editor).toContainText('Hello world');
  });
});
