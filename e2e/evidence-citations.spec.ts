import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const COURSE_ID = '30000000-0000-0000-0000-000000000001';
const COURSE_URL = `/dashboard/courses/${COURSE_ID}`;

// Seeded course_material used as citation source in the mocked AI response.
const SEEDED_MATERIAL_ID = '50000000-0000-0000-0000-000000000001';
const SEEDED_MATERIAL_NAME = 'lecture-1-slides.pdf';

// ──────────────────────────────────────────────────────────────────────────────
// Helper: navigate to the course page, open the Create Document dialog, and
// submit it to land on a new document page.  Returns after the URL has changed.
// ──────────────────────────────────────────────────────────────────────────────
async function openNewCourseDocument(page: Parameters<typeof login>[0]) {
  await page.goto(COURSE_URL);
  await expect(page).toHaveURL(/\/dashboard\/courses\//, {
    timeout: 15_000,
  });

  // Click "New Document" button — this opens the CreateDocumentDialog
  await page.getByRole('button', { name: 'New Document' }).click({
    timeout: 10_000,
  });

  // Wait for the dialog title to appear
  await expect(page.getByText('Create New Document')).toBeVisible({
    timeout: 8_000,
  });

  // Click the "Create" submit button (exact match to avoid "Creating...")
  await page
    .getByRole('button', { name: 'Create', exact: true })
    .click({ timeout: 5_000 });

  // Wait for navigation to the new document page
  await expect(page).toHaveURL(/\/dashboard\/documents\//, { timeout: 15_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// Test: AI response with a blockquote and a page-level citation renders the
// quote, the citation badge, and the file-viewer jump — all with a mocked API.
// ──────────────────────────────────────────────────────────────────────────────
test('AI evidence quote renders blockquote + citation badge + file viewer (mocked AI response)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  // SSE body: sources event → text event with blockquote + inline citation → done
  const sseBody = [
    `data: ${JSON.stringify({
      type: 'sources',
      sources: [
        {
          sourceType: 'course_material',
          sourceId: SEEDED_MATERIAL_ID,
          sourceName: SEEDED_MATERIAL_NAME,
          pageRange: 'p. 7',
          signedUrl: null,
        },
      ],
      model: 'flash',
      contextFilesUsed: false,
    })}`,
    '',
    `data: ${JSON.stringify({
      type: 'text',
      text: '> Eigenvalues satisfy det(A − λI) = 0.\n\nThat identity is the definition (lecture-1-slides.pdf, p. 7).',
    })}`,
    '',
    `data: ${JSON.stringify({ type: 'done' })}`,
    '',
  ].join('\n');

  await page.route('**/api/ai/ask', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: sseBody,
    });
  });

  await login(page);
  await openNewCourseDocument(page);

  // Open AI chat
  const aiButton = page.getByRole('button', { name: 'Open AI chat' });
  await expect(aiButton).toBeVisible({ timeout: 10_000 });
  await aiButton.click();

  // Chat panel open — fill in a question and submit
  const chatInput = page.locator(
    'input[placeholder*="Ask anything about your course materials"]',
  );
  await expect(chatInput).toBeVisible({ timeout: 8_000 });
  await chatInput.fill('What are eigenvalues?');

  // Submit via the form's submit button (Send icon button)
  await page
    .locator('form')
    .filter({ has: chatInput })
    .locator('[type="submit"]')
    .click({ timeout: 5_000 });

  // The blockquote from the mocked answer must render
  await expect(page.locator('blockquote')).toContainText('det', {
    timeout: 15_000,
  });

  // Citation badge should appear with the file name and page reference
  const citation = page.getByTestId('ai-citation').first();
  await expect(citation).toBeVisible({ timeout: 15_000 });
  await expect(citation).toContainText(SEEDED_MATERIAL_NAME);
  await expect(citation).toContainText('p. 7');

  // Clicking the citation opens the file viewer
  await citation.click();
  await expect(page.getByTestId('file-viewer')).toBeVisible({
    timeout: 10_000,
  });
});
