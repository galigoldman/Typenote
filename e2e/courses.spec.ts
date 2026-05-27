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

  test('view course shows documents and materials (flat model)', async ({
    page,
  }) => {
    await goToSeededCourse(page);

    // The course page shows the course title (asserted by the helper too).
    await expect(
      page.getByRole('heading', { name: 'Introduction to CS' }),
    ).toBeVisible({ timeout: 10_000 });

    // Flat model: there are no weeks. Materials are listed directly under a
    // "Materials" heading, and seeded course materials show by name.
    await expect(page.getByRole('heading', { name: 'Materials' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Lecture 1: Intro to Programming')).toBeVisible(
      { timeout: 10_000 },
    );
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

  test('opening a course document loads the canvas editor', async ({
    page,
  }) => {
    test.setTimeout(30_000);

    await goToSeededCourse(page);

    // Open a seeded document. (Course materials open the same way, but the
    // seed only inserts their DB rows — not storage objects — so opening a
    // material would fail on the signed-URL fetch. Documents carry their
    // content in the DB and open reliably.)
    await page.getByText('Problem Set 1: Variables').first().click();

    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });

    // The canvas editor renders at least one page container.
    await expect(page.locator('[data-page-id]').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
