import { test, expect, type Page } from '@playwright/test';

const EDITOR_URL = '/test/editor';

function getEditor(page: Page) {
  return page.locator('.ProseMirror');
}

test.describe('Offline Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    await expect(getEditor(page)).toBeVisible();
  });

  test('shows offline banner when network is disconnected', async ({
    page,
    context,
  }) => {
    // Verify banner is not shown when online
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);

    // Go offline
    await context.setOffline(true);

    // The offline banner should appear
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toContainText(
      "You're offline",
    );
  });

  test('hides offline banner when network reconnects', async ({
    page,
    context,
  }) => {
    // Go offline
    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();

    // Go back online
    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
  });

  test('editor remains functional when offline', async ({ page, context }) => {
    const editor = getEditor(page);

    // Go offline
    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();

    // Click into the editor and type
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' offline text');

    // Verify the text was inserted
    await expect(editor).toContainText('offline text');
  });
});
