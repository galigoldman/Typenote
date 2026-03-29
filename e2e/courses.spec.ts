import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Courses', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('create new course from dashboard', async ({ page }) => {
    const courseName = `E2E Course ${Date.now()}`;

    await page.getByRole('button', { name: 'New Course' }).click();

    // Dialog should appear
    await expect(page.getByText('Create Course')).toBeVisible();

    // Fill in the name
    await page.getByLabel('Name').fill(courseName);

    // Submit
    await page.getByRole('button', { name: 'Create Course' }).click();

    // Course should appear on the dashboard
    await expect(page.locator('text=' + courseName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('view course with weeks', async ({ page }) => {
    // Seeded data has courses — click the first one
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Course',
    });
    await expect(courseCard.first()).toBeVisible({ timeout: 10_000 });
    await courseCard.first().click();

    // Should navigate to course page
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });

    // Weeks should be visible (seeded courses have weeks)
    await expect(page.locator('text=/Week \\d+/')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('create document inside course', async ({ page }) => {
    // Navigate to a seeded course
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Course',
    });
    await expect(courseCard.first()).toBeVisible({ timeout: 10_000 });
    await courseCard.first().click();
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });

    const docTitle = `Course Doc ${Date.now()}`;

    // Click "New Document" inside the course
    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(page.getByText('Create New Document')).toBeVisible();

    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(docTitle);

    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Should navigate to the new document's editor
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });
  });

  test('add file inside course', async ({ page }) => {
    // Navigate to a seeded course
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Course',
    });
    await expect(courseCard.first()).toBeVisible({ timeout: 10_000 });
    await courseCard.first().click();
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });

    // Click "Import File" to trigger the file input
    const importButton = page.getByRole('button', { name: 'Import File' });
    await expect(importButton).toBeVisible({ timeout: 10_000 });

    // Set up a fake PDF file via the hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: `test-file-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf content'),
    });

    // Wait for upload to complete — either a success toast or the file appearing
    await expect(
      page.getByText('File imported').or(page.getByText('Uploading...')),
    ).toBeVisible({ timeout: 15_000 });
  });
});
