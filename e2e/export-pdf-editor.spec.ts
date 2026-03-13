import { test, expect } from '@playwright/test';

test.describe('Export PDF from Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/editor');
    // Wait for the TipTap editor to mount
    await expect(page.locator('.ProseMirror')).toBeVisible();
  });

  test('Export as PDF button is visible in toolbar', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Export as PDF', exact: true }),
    ).toBeVisible();
  });

  test('clicking Export as PDF triggers a download', async ({ page }) => {
    // Listen for the download event before clicking
    const downloadPromise = page.waitForEvent('download');

    await page
      .getByRole('button', { name: 'Export as PDF', exact: true })
      .click();

    const download = await downloadPromise;

    // Verify the filename ends with .pdf
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    // The mock document title is "Test Document"
    expect(download.suggestedFilename()).toBe('Test Document.pdf');
  });
});
