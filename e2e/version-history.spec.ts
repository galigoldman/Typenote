import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// The seeded "Limits and Continuity" document has 3 version snapshots
const SEEDED_DOC_TITLE = 'Limits and Continuity';

test.describe('Version History', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('open version history sidebar from document', async ({ page }) => {
    // Navigate to the seeded document that has versions
    // Open Calculus I folder first
    const folder = page.getByText('Calculus I').first();
    await expect(folder).toBeVisible({ timeout: 10_000 });
    await folder.click();

    // Click on the document
    const doc = page.getByText(SEEDED_DOC_TITLE).first();
    await expect(doc).toBeVisible({ timeout: 10_000 });
    await doc.click();

    // Wait for editor to load
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Click the version history button (Clock icon)
    const historyButton = page.getByTitle('Version history');
    await expect(historyButton).toBeVisible({ timeout: 10_000 });
    await historyButton.click();

    // Version sidebar should appear with "Version History" heading
    await expect(page.getByText('Version History')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('version sidebar shows seeded version entries', async ({ page }) => {
    // Navigate to the document with seeded versions
    const folder = page.getByText('Calculus I').first();
    await expect(folder).toBeVisible({ timeout: 10_000 });
    await folder.click();

    const doc = page.getByText(SEEDED_DOC_TITLE).first();
    await expect(doc).toBeVisible({ timeout: 10_000 });
    await doc.click();

    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Open version history
    await page.getByTitle('Version history').click();
    await expect(page.getByText('Version History')).toBeVisible({
      timeout: 5_000,
    });

    // Should show "Auto-saved" labels (the 3 seeded versions all have Auto-saved triggers)
    const autoSavedLabels = page.getByText('Auto-saved');
    await expect(autoSavedLabels.first()).toBeVisible({ timeout: 5_000 });
  });

  test('restore a version shows "Before restore" entry', async ({ page }) => {
    // Navigate to the document
    const folder = page.getByText('Calculus I').first();
    await expect(folder).toBeVisible({ timeout: 10_000 });
    await folder.click();

    const doc = page.getByText(SEEDED_DOC_TITLE).first();
    await expect(doc).toBeVisible({ timeout: 10_000 });
    await doc.click();

    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Open version history
    await page.getByTitle('Version history').click();
    await expect(page.getByText('Version History')).toBeVisible({
      timeout: 5_000,
    });

    // Click the first version entry to select it
    const autoSaved = page.getByText('Auto-saved').first();
    await expect(autoSaved).toBeVisible({ timeout: 5_000 });
    await autoSaved.click();

    // "Restore this version" button should appear
    const restoreButton = page.getByText('Restore this version');
    await expect(restoreButton).toBeVisible({ timeout: 5_000 });

    // Click restore
    await restoreButton.click();

    // After restore, should see a "Before restore" entry in the sidebar
    await expect(page.getByText('Before restore')).toBeVisible({
      timeout: 10_000,
    });
  });
});
