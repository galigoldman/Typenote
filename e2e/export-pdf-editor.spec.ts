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
    // PDF export uses puppeteer-core for server-side rendering, which needs
    // its own Chromium binary not available in CI. Skip until CI installs it.
    test.skip(!!process.env.CI, 'PDF export needs puppeteer Chromium in CI');
    test.setTimeout(60_000);

    // Listen for the download event before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });

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
