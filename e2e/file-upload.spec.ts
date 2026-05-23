import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { goToSeededCourse } from './helpers/navigate';

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('import file into course', async ({ page }) => {
    test.setTimeout(30_000);
    await goToSeededCourse(page);
    await expect(page.getByRole('button', { name: 'Import File' })).toBeVisible(
      { timeout: 15_000 },
    );

    const fileName = `test-upload-${Date.now()}.pdf`;

    // The hidden file input is in the DOM — set files directly
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf content for testing'),
    });

    // Wait for upload to complete
    await expect(page.getByText('File imported')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('open imported file creates a document', async ({ page }) => {
    // File conversion (PDF → document) is a complex server-side operation
    // that's unreliable in CI's local Supabase environment.
    test.skip(!!process.env.CI, 'File conversion unreliable in local CI');
    test.setTimeout(45_000);
    await goToSeededCourse(page);
    await expect(page.getByRole('button', { name: 'Import File' })).toBeVisible(
      { timeout: 15_000 },
    );

    const fileName = `test-open-${Date.now()}.pdf`;

    // Upload a file first
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf content for testing'),
    });

    await expect(page.getByText('File imported')).toBeVisible({
      timeout: 15_000,
    });

    // Find the uploaded file in the list and click it
    const displayName = fileName.replace('.pdf', '');
    const fileItem = page.locator('button', { hasText: displayName });
    await expect(fileItem).toBeVisible({ timeout: 10_000 });
    await fileItem.click();

    // Should navigate to a document (file gets converted)
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });
  });

  test('delete imported file', async ({ page }) => {
    test.setTimeout(45_000);
    await goToSeededCourse(page);
    await expect(page.getByRole('button', { name: 'Import File' })).toBeVisible(
      { timeout: 15_000 },
    );

    const fileName = `test-delete-${Date.now()}.pdf`;

    // Upload a file first
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf content for testing'),
    });

    await expect(page.getByText('File imported')).toBeVisible({
      timeout: 15_000,
    });

    // Find the file row and hover to reveal delete button
    const displayName = fileName.replace('.pdf', '');
    const fileRow = page
      .locator('div')
      .filter({ hasText: displayName })
      .first();
    await expect(fileRow).toBeVisible({ timeout: 10_000 });
    await fileRow.hover();

    // Delete uses window.confirm — Playwright dismisses dialogs by
    // default, so opt into accepting this one before triggering it.
    page.once('dialog', (d) => d.accept());

    // Click the delete button (trash icon, appears on hover)
    const deleteButton = fileRow.locator('button').last();
    await deleteButton.click();

    // File should disappear
    await expect(
      page.locator('button', { hasText: displayName }),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
