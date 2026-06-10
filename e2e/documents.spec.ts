import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Documents', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('create new document from dashboard', async ({ page }) => {
    const docTitle = `E2E Test Doc ${Date.now()}`;

    // Click "New Document" button to open the dialog
    await page.getByRole('button', { name: 'New Document' }).click();

    // Dialog should appear
    await expect(page.getByText('Create New Document')).toBeVisible();

    // Fill in the title (clear the default "Untitled" first)
    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(docTitle);

    // Click "Create"
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Should navigate to the new document's editor
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });
  });

  test('create document dialog has no subject selector', async ({ page }) => {
    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(page.getByText('Create New Document')).toBeVisible();

    // Subject selection was removed from creation: the dialog should expose a
    // title input and page-style choices, but no subject combobox/label.
    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByText('Subject', { exact: true })).toHaveCount(0);

    // It still creates a document end-to-end.
    const docTitle = `No Subject ${Date.now()}`;
    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(docTitle);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });
  });

  test('create dialog stays open with a disabled Creating button until the editor renders', async ({
    page,
  }) => {
    // Delay server-action POSTs so the pending state is reliably observable
    // (locally the create action + navigation can finish in milliseconds).
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.headers()['next-action']) {
        await new Promise((r) => setTimeout(r, 800));
      }
      await route.continue();
    });

    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(page.getByText('Create New Document')).toBeVisible();
    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(`Loading State ${Date.now()}`);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // While the document is being created, the dialog must stay open and the
    // submit button must show the in-progress state.
    const creating = page.getByRole('button', { name: 'Creating...' });
    await expect(creating).toBeVisible();
    await expect(creating).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect(page.getByText('Create New Document')).toBeVisible();

    // The dialog disappears only because navigation lands in the editor.
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });
  });

  test('document card shows a spinner while the editor is loading', async ({
    page,
  }) => {
    // Delay the editor route fetch so the card's pending spinner is visible.
    await page.route('**/dashboard/documents/**', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });

    const firstDoc = page.locator('[data-testid="document-card"]').first();
    await expect(firstDoc).toBeVisible({ timeout: 10_000 });
    await firstDoc.click();

    await expect(
      page.getByTestId('document-card-loading').first(),
    ).toBeVisible();

    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });
  });

  test('open existing document navigates to editor', async ({ page }) => {
    // Click the first document card on the dashboard
    const firstDoc = page.locator('[data-testid="document-card"]').first();
    await expect(firstDoc).toBeVisible({ timeout: 10_000 });
    await firstDoc.click();

    // Should navigate to the document editor
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // The editor (either TipTap or Canvas) should be visible
    const editor = page.locator('.ProseMirror, canvas');
    await expect(editor.first()).toBeVisible({ timeout: 10_000 });
  });

  test('delete document removes it from dashboard', async ({ page }) => {
    // First, create a document so we don't delete seeded data
    const docTitle = `Delete Me ${Date.now()}`;
    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(page.getByText('Create New Document')).toBeVisible();
    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(docTitle);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Go back to dashboard
    await page.goto('/dashboard');

    // Find the document we just created and open its options menu
    const docCard = page.locator('[data-testid="document-card"]', {
      hasText: docTitle,
    });
    await expect(docCard).toBeVisible({ timeout: 10_000 });

    await docCard.getByRole('button', { name: 'Document options' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    // Document should disappear from the dashboard
    await expect(docCard).not.toBeVisible({ timeout: 10_000 });
  });

  test('document appears in correct folder', async ({ page }) => {
    // The seeded data has folders — navigate to the first folder
    const firstFolder = page.locator('[role="button"]', {
      hasText: 'Folder',
    });
    await expect(firstFolder.first()).toBeVisible({ timeout: 10_000 });
    await firstFolder.first().click();

    // Should navigate to the folder page
    await expect(page).toHaveURL(/\/dashboard\/folders\//, {
      timeout: 10_000,
    });

    // Documents should be visible inside the folder
    const docs = page.locator('[data-testid="document-card"]');
    await expect(docs.first()).toBeVisible({ timeout: 10_000 });
  });

  test('move document to different folder via dialog', async ({ page }) => {
    // Create a document to move (don't move seeded data)
    const docTitle = `Move Me ${Date.now()}`;
    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(page.getByText('Create New Document')).toBeVisible();
    const titleInput = page.getByLabel('Title');
    await titleInput.clear();
    await titleInput.fill(docTitle);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Go back to dashboard
    await page.goto('/dashboard');

    // Find the document and open its options menu
    const docCard = page.locator('[data-testid="document-card"]', {
      hasText: docTitle,
    });
    await expect(docCard).toBeVisible({ timeout: 10_000 });

    await docCard.getByRole('button', { name: 'Document options' }).click();
    await page.getByRole('menuitem', { name: 'Move' }).click();

    // Move dialog should appear
    await expect(page.getByText('Move Document')).toBeVisible();

    // Select the first available folder
    const folderOption = page
      .locator('button', { hasText: 'FOLDERS' })
      .locator('..')
      .locator('button')
      .nth(1);

    // If folders exist, click one and move
    const foldersHeader = page.getByText('FOLDERS');
    if (await foldersHeader.isVisible()) {
      // Click the first folder in the list
      const folderButton = foldersHeader
        .locator('..')
        .locator('..')
        .locator('button[type="button"]')
        .first();
      await folderButton.click();

      // Click "Move Here"
      await page.getByRole('button', { name: 'Move Here' }).click();

      // Dialog should close
      await expect(page.getByText('Move Document')).not.toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('rename document from editor title input', async ({ page }) => {
    // Create a document to rename
    const originalTitle = `Rename Me ${Date.now()}`;
    await page.getByRole('button', { name: 'New Document' }).click();
    await expect(page.getByText('Create New Document')).toBeVisible();
    const dialogTitle = page.getByLabel('Title');
    await dialogTitle.clear();
    await dialogTitle.fill(originalTitle);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // Find the title input at the top of the editor (placeholder "Untitled")
    const titleInput = page.getByPlaceholder('Untitled');
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await expect(titleInput).toHaveValue(originalTitle);

    // Rename it
    const newTitle = `Renamed ${Date.now()}`;
    await titleInput.clear();
    await titleInput.fill(newTitle);

    // Click away to trigger blur (auto-save)
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(1000);

    // Reload and verify the name stuck
    await page.reload();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await expect(titleInput).toHaveValue(newTitle);
  });
});
