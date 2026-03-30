import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Courses', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('create new course from dashboard', async ({ page }) => {
    const courseName = `E2E Course ${Date.now()}`;

    await page.getByRole('button', { name: 'New Course' }).click();

    // Dialog should appear — check the heading, not generic text
    await expect(
      page.getByRole('heading', { name: 'Create Course' }),
    ).toBeVisible();

    // Fill in the name
    await page.getByLabel('Name').fill(courseName);

    // Submit
    await page.getByRole('button', { name: 'Create Course' }).click();

    // Course should appear on the dashboard
    await expect(page.getByText(courseName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('view course with weeks', async ({ page }) => {
    // Seeded course "Introduction to CS" is at root level with 3 weeks
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Introduction to CS',
    });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });
    await courseCard.click();

    // Should navigate to course page
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });

    // Weeks should be visible — seeded weeks have topics like "Variables and Data Types"
    await expect(page.getByText('Variables and Data Types')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('create document inside course', async ({ page }) => {
    // Navigate to seeded course
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Introduction to CS',
    });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });
    await courseCard.click();
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });

    const docTitle = `Course Doc ${Date.now()}`;

    // Click "New Document" inside the course
    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(
      page.getByRole('heading', { name: 'Create New Document' }),
    ).toBeVisible();

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
    test.setTimeout(45_000);

    // Navigate to seeded course
    const courseCard = page.locator('[role="button"]', {
      hasText: 'Introduction to CS',
    });
    await expect(courseCard).toBeVisible({ timeout: 10_000 });
    await courseCard.click();
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });

    // Wait for the Import File button to be visible
    const importButton = page.getByRole('button', { name: 'Import File' });
    await expect(importButton).toBeVisible({ timeout: 10_000 });

    // The hidden file input is already in the DOM — set files on it directly
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: `test-file-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf content'),
    });

    // Wait for upload to complete
    await expect(page.getByText('File imported')).toBeVisible({
      timeout: 20_000,
    });
  });
});
