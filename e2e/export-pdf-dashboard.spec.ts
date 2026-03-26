import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Export PDF from Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Export as PDF option exists in document card context menu', async ({
    page,
  }) => {
    // Wait for at least one document card to appear
    const optionsButton = page
      .getByRole('button', { name: 'Document options' })
      .first();
    await expect(optionsButton).toBeVisible({ timeout: 10000 });

    // Open the context menu
    await optionsButton.click();

    // Verify Export as PDF option exists
    await expect(
      page.getByRole('menuitem', { name: /export as pdf/i }),
    ).toBeVisible();
  });

  test('clicking Export as PDF triggers a download', async ({ page }) => {
    // PDF generation uses server-side rendering and can be slow in CI
    test.setTimeout(60_000);

    const optionsButton = page
      .getByRole('button', { name: 'Document options' })
      .first();
    await expect(optionsButton).toBeVisible({ timeout: 10000 });

    await optionsButton.click();

    // Listen for download before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
    await page.getByRole('menuitem', { name: /export as pdf/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
