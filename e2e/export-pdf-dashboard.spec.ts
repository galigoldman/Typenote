import { test, expect } from '@playwright/test';

// Dashboard export requires authentication
const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe('Export PDF from Dashboard', () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD',
  );

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL!);
    await page.getByLabel('Password').fill(TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard**');
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
    const optionsButton = page
      .getByRole('button', { name: 'Document options' })
      .first();
    await expect(optionsButton).toBeVisible({ timeout: 10000 });

    await optionsButton.click();

    // Listen for download before clicking
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /export as pdf/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
