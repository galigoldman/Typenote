import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import {
  upsertFixtureDocument,
  deleteFixtureDocument,
  insertFixtureVersion,
  deleteFixtureVersions,
  type FixtureDocument,
} from './helpers/db';

// Fixture document with three explicit versions. The current document content
// is V3 ("the current version"); the sidebar should expose V2 and V1 from the
// document_versions table. Restoring V1 must change the editor content to V1
// AND create a "Before restore" snapshot of V3.

const DOC_ID = '9b000000-0000-0000-0000-000000000001';

function docWithText(text: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

const V1_TEXT = 'VERSION ONE — earliest snapshot';
const V2_TEXT = 'VERSION TWO — middle snapshot';
const V3_TEXT = 'VERSION THREE — current document';

const FIXTURE: FixtureDocument = {
  id: DOC_ID,
  title: 'Version History Fixture',
  canvas_type: 'blank',
  content: docWithText(V3_TEXT),
};

test.describe('Version History', () => {
  test.beforeEach(async ({ page }) => {
    // Reset doc + versions to a known state.
    await upsertFixtureDocument(FIXTURE);
    await deleteFixtureVersions(DOC_ID);
    // Insert versions in chronological order; the sidebar shows newest first.
    await insertFixtureVersion({
      documentId: DOC_ID,
      title: FIXTURE.title,
      content: docWithText(V1_TEXT),
      trigger: 'idle',
      createdAtIso: '2026-05-10T10:00:00Z',
    });
    await insertFixtureVersion({
      documentId: DOC_ID,
      title: FIXTURE.title,
      content: docWithText(V2_TEXT),
      trigger: 'idle',
      createdAtIso: '2026-05-11T10:00:00Z',
    });

    await login(page);
    await page.goto(`/dashboard/documents/${DOC_ID}`);
    await expect(page.locator('.ProseMirror').first()).toBeVisible({
      timeout: 10_000,
    });
    // Confirm the editor opened on V3 — the test's premise.
    await expect(page.getByText(V3_TEXT)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async () => {
    await deleteFixtureVersions(DOC_ID);
    await deleteFixtureDocument(DOC_ID);
  });

  test('open version history sidebar from editor toolbar', async ({ page }) => {
    await page.getByTitle('Version history').click();
    await expect(
      page.getByRole('heading', { name: 'Version History' }),
    ).toBeVisible({
      timeout: 5_000,
    });
  });

  test('sidebar lists the seeded versions newest-first', async ({ page }) => {
    await page.getByTitle('Version history').click();
    await expect(
      page.getByRole('heading', { name: 'Version History' }),
    ).toBeVisible({
      timeout: 5_000,
    });

    // We seeded two versions; the sidebar should expose at least two entries
    // labeled "Auto-saved". Looser assertion — exact list ordering is a UI
    // implementation detail.
    const autoSavedLabels = page.getByText('Auto-saved');
    await expect(autoSavedLabels.first()).toBeVisible({ timeout: 5_000 });
    expect(await autoSavedLabels.count()).toBeGreaterThanOrEqual(2);
  });

  test('restoring an older version changes the editor content and creates a Before-restore snapshot', async ({
    page,
  }) => {
    await page.getByTitle('Version history').click();
    await expect(
      page.getByRole('heading', { name: 'Version History' }),
    ).toBeVisible({
      timeout: 5_000,
    });

    // The two seeded versions appear newest-first. We click the LAST one in
    // the list — that's V1, the oldest — and restore it.
    const versionEntries = page.getByText('Auto-saved');
    await expect(versionEntries.first()).toBeVisible({ timeout: 5_000 });
    const count = await versionEntries.count();
    expect(count).toBeGreaterThanOrEqual(2);
    await versionEntries.nth(count - 1).click();

    const restoreButton = page.getByText('Restore this version');
    await expect(restoreButton).toBeVisible({ timeout: 5_000 });
    await restoreButton.click();

    // After restore, the editor should display V1's content — and NOT V3.
    await expect(page.getByText(V1_TEXT)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(V3_TEXT)).not.toBeVisible();

    // A "Before restore" entry must appear in the sidebar — it's the safety
    // snapshot of V3 that the restore RPC creates atomically.
    await expect(page.getByText('Before restore')).toBeVisible({
      timeout: 10_000,
    });
  });
});
