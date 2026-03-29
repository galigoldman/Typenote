import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

    // Navigate to a seeded course (files need a course context)
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Course',
    });
    await expect(courseCard.first()).toBeVisible({ timeout: 10_000 });
    await courseCard.first().click();
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });
  });

  test('import file into course', async ({ page }) => {
    test.setTimeout(30_000);

    const fileName = `test-upload-${Date.now()}.pdf`;

    // The file input is hidden — set files directly
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
    test.setTimeout(30_000);

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
    const fileItem = page.locator('button', {
      hasText: fileName.replace('.pdf', ''),
    });
    await expect(fileItem).toBeVisible({ timeout: 10_000 });
    await fileItem.click();

    // Should navigate to a document (file gets converted)
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });
  });

  test('delete imported file', async ({ page }) => {
    test.setTimeout(30_000);

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
    const fileRow = page.locator('div', { hasText: displayName }).first();
    await expect(fileRow).toBeVisible({ timeout: 10_000 });
    await fileRow.hover();

    // Click the delete button (trash icon, appears on hover)
    const deleteButton = fileRow.locator('button').last();
    await deleteButton.click();

    // File should disappear
    await expect(
      page.locator('button', { hasText: displayName }),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
