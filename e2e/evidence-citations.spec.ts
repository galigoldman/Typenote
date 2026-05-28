import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const COURSE_ID = '30000000-0000-0000-0000-000000000001';
const COURSE_URL = `/dashboard/courses/${COURSE_ID}`;

// Seeded course_material referenced by the mocked AI response.
const SEEDED_MATERIAL_ID = '50000000-0000-0000-0000-000000000001';

// ──────────────────────────────────────────────────────────────────────────────
// Navigate to the course page, create a fresh document, land on its page.
// ──────────────────────────────────────────────────────────────────────────────
async function openNewCourseDocument(page: Parameters<typeof login>[0]) {
  await page.goto(COURSE_URL);
  await expect(page).toHaveURL(/\/dashboard\/courses\//, { timeout: 15_000 });

  await page.getByRole('button', { name: 'New Document' }).click({
    timeout: 10_000,
  });
  await expect(page.getByText('Create New Document')).toBeVisible({
    timeout: 8_000,
  });
  await page
    .getByRole('button', { name: 'Create', exact: true })
    .click({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/dashboard\/documents\//, { timeout: 15_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// Evidence-citations E2E — the citation → file-viewer jump.
//
// Scope note: the answer *content* assertions for this feature (a verbatim
// markdown blockquote renders; a citation is emitted per (source, page) as
// "p. N") are covered by unit tests — see `markdown-response.test.tsx`
// ("resilience & RTL" + blockquote rendering) and `ai-context.test.ts`
// ("multi-chunk retrieval + page citations"). They are NOT re-asserted here:
// the app is a PWA whose service worker, plus the route's server-side
// AI_RATE_LIMIT_DEBUG path, mean `page.route` cannot reliably drive the AI
// *response body* in CI. What only a browser can prove — and what this test
// guards — is that an AI citation badge is clickable and opens the in-app file
// viewer (the jump-to-source payoff of the feature). The page.route mock below
// gives a deterministic citation when it is honored; the assertions are written
// to hold regardless.
// ──────────────────────────────────────────────────────────────────────────────
test('AI citation badge opens the in-app file viewer (jump-to-source)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  const sseBody = [
    `data: ${JSON.stringify({
      type: 'sources',
      sources: [
        {
          sourceType: 'course_material',
          sourceId: SEEDED_MATERIAL_ID,
          sourceName: 'lecture-1-slides.pdf',
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

  // Open AI chat.
  const aiButton = page.getByRole('button', { name: 'Open AI chat' });
  await expect(aiButton).toBeVisible({ timeout: 10_000 });
  await aiButton.click();

  // Ask a question.
  const chatInput = page.locator(
    'input[placeholder*="Ask anything about your course materials"]',
  );
  await expect(chatInput).toBeVisible({ timeout: 8_000 });
  await chatInput.fill('What defines an eigenvalue?');
  await page
    .locator('form')
    .filter({ has: chatInput })
    .locator('[type="submit"]')
    .click({ timeout: 5_000 });

  // A source citation badge should appear, and clicking it opens the file viewer
  // scrolled to the cited source — the core jump-to-source behavior.
  const citation = page.getByTestId('ai-citation').first();
  await expect(citation).toBeVisible({ timeout: 20_000 });
  await citation.click();
  await expect(page.getByTestId('file-viewer')).toBeVisible({
    timeout: 10_000,
  });
});
