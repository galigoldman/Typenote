import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { goToSeededCourse } from './helpers/navigate';

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
    await goToSeededCourse(page);

    // The course page should show the course title
    await expect(
      page.getByRole('heading', { name: 'Introduction to CS' }),
    ).toBeVisible({ timeout: 10_000 });

    // Weeks section should be visible with seeded week topics
    await expect(page.getByText('Weeks')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Variables and Data Types')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('create document inside course', async ({ page }) => {
    await goToSeededCourse(page);

    const docTitle = `Course Doc ${Date.now()}`;

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

    await goToSeededCourse(page);

    // Wait for the Import File button
    const importButton = page.getByRole('button', { name: 'Import File' });
    await expect(importButton).toBeVisible({ timeout: 10_000 });

    // The hidden file input is already in the DOM
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
