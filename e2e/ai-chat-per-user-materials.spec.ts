import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { goToSeededCourse } from './helpers/navigate';

/**
 * AI chat — per-user material access
 *
 * These tests verify that:
 *   1. A user can see source citations for files they have imported into their
 *      course notebook when they ask the AI a question.
 *   2. After removing a file from the notebook, that file no longer appears as
 *      a citation in subsequent AI responses.
 *
 * Both tests use the single seeded user (test@typenote.dev / Test1234).
 * A true two-user isolation test would require a second seeded user — that is
 * out of scope here and noted as a follow-up in TEST_REGISTRY.md.
 *
 * These tests are skipped in CI because they require:
 *   - A live AI API key (GOOGLE_AI_API_KEY)
 *   - A course page that renders correctly in the CI environment
 */

// Seeded course — matches `goToSeededCourse` in helpers/navigate.ts
const TEST_QUESTION = 'What topics are covered in the course materials?';

test.describe('AI chat — per-user material access', () => {
  test.skip(
    !!process.env.CI,
    'Per-user AI chat tests need a real AI API key and stable course page; skipped in CI',
  );

  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToSeededCourse(page);
  });

  test('user sees materials they imported in chat', async ({ page }) => {
    test.setTimeout(60_000);

    // Open AI chat panel
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Send a question that should draw on uploaded course materials
    const input = page.locator(
      'input[placeholder*="Ask about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(TEST_QUESTION);
    await page.keyboard.press('Enter');

    // Wait for a response to appear — the AI response bubble
    await expect(page.locator('div.bg-muted.rounded-2xl').first()).toBeVisible({
      timeout: 30_000,
    });

    // At least one source citation link referencing an uploaded file should
    // be visible (PDF, DOCX, or PPTX attachment).
    await expect(
      page.getByRole('link', { name: /\.pdf|\.docx|\.pptx/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('removing a file from notebook hides it from chat', async ({ page }) => {
    test.setTimeout(90_000);

    // Locate the first Moodle / personal file row visible on the course page.
    // The data-moodle-file-row attribute is set on each file-list row.
    const fileRow = page.locator('[data-moodle-file-row]').first();

    // If no file rows are visible the test cannot proceed — skip gracefully.
    const rowVisible = await fileRow
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!rowVisible) {
      test.skip(true, 'No file rows with [data-moodle-file-row] visible — seed data may be missing');
    }

    // Capture the display name of the first file so we can check it disappears.
    const fileName = await fileRow.locator('span.flex-1').innerText();

    // Accept any browser confirmation dialog (some delete flows use window.confirm).
    page.once('dialog', (d) => d.accept());

    // Click the remove-from-notebook button on the row.
    // The button label matches the remove/delete action rendered in the UI.
    await fileRow
      .getByRole('button', { name: /Remove|Delete/i })
      .first()
      .click();

    // The file row should disappear from the page.
    await expect(page.getByText(fileName, { exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });

    // Now open AI chat and ask a question.
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    const input = page.locator(
      'input[placeholder*="Ask about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(TEST_QUESTION);
    await page.keyboard.press('Enter');

    // Wait for the AI response to appear.
    await expect(page.locator('div.bg-muted.rounded-2xl').first()).toBeVisible({
      timeout: 30_000,
    });

    // The deleted file must NOT appear in any source citation in the response.
    const chatPanel = page.locator('[data-chat-panel]').or(
      page.locator('div').filter({ hasText: 'AI Tutor' }).last(),
    );
    await expect(chatPanel.getByText(fileName)).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});
