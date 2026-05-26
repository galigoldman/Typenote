import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { goToSeededCourse } from './helpers/navigate';

// Seeded homework document (supabase/seed.sql): a homework_sessions row links
// this doc to the exercise "Problem Set 1: Variables" and pins the course
// material "Lecture 1: Intro to Programming". Opening the doc directly
// exercises the homework-context chip + AI plumbing. The Gemini call is mocked,
// so no GOOGLE_GENERATIVE_AI_API_KEY is needed — the context-building logic
// itself is covered by unit + integration tests.
const HOMEWORK_DOC_URL =
  '/dashboard/documents/20000000-0000-0000-0000-000000000011';

/** SSE body the chat panel parses: split on \n\n, lines starting "data: ". */
function buildSseBody(text: string): string {
  const event = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  return [
    event({
      type: 'sources',
      sources: [],
      model: 'flash',
      homeworkContextUsed: true,
    }),
    event({ type: 'text', text }),
    event({ type: 'done' }),
  ].join('');
}

test.describe('Homework-focused AI context', () => {
  test.beforeEach(async ({ page }) => {
    // Generous quota so the chat input isn't disabled.
    await page.route('**/api/ai/quota**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chat: { used: 0, limit: 1000, remaining: 1000 },
          latex: { used: 0, limit: 1000, remaining: 1000 },
          tier: 'beta',
        }),
      });
    });

    // Open the chat with no stored history so the only assistant bubble is the
    // one we mock below (the seed has prior conversations for this course).
    await page.route('**/api/ai/conversations**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ conversations: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await login(page);
  });

  test('homework doc shows the context chip and the AI tutor responds', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Mock the chat endpoint — deterministic, no Gemini key required.
    await page.route('**/api/ai/ask', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSseBody(
          'Question 1 asks you to explain mutable vs immutable types.',
        ),
      });
    });

    // Open the seeded homework document directly.
    await page.goto(HOMEWORK_DOC_URL);
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 10_000,
    });

    // The homework context chip is rendered server-side from
    // getHomeworkContext: it names the exercise and the pinned material.
    const chip = page.getByTestId('homework-context');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toContainText('Problem Set 1: Variables');
    await expect(chip).toContainText('lecture-1-slides.pdf');

    // Open the AI tutor and send a question (response is mocked above).
    await page.getByRole('button', { name: 'Open AI chat' }).click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    const input = page.locator('input[placeholder*="course materials"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('What is question 1 asking?');
    await page.keyboard.press('Enter');

    // The mocked assistant response renders in the chat. Assert on its unique
    // text (the page also has a `.prose` TipTap editor, so scope by content).
    await expect(
      page.getByText('mutable vs immutable types', { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Regression: the course page passed full document rows (heavy content/pages
  // JSONB) to the StartHomeworkDialog client component. On client-side
  // navigation that bloated RSC payload dropped the dialog's trigger button, so
  // "Start Homework" silently disappeared on any course that had documents.
  // This drives the real flow via client-side nav (clicking the course link).
  test('start homework from the course page (client-side nav) creates a session', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // beforeEach already logged in and left us on /dashboard.
    await goToSeededCourse(page); // client-side navigation — the broken path

    // The trigger must be present after a soft navigation to a populated course.
    await page.getByRole('button', { name: /start homework/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Pick the seeded exercise document, then start.
    await page
      .getByRole('dialog')
      .getByText('Problem Set 1: Variables', { exact: false })
      .first()
      .click();
    await page.getByRole('button', { name: /^start$/i }).click();

    // Navigates to the freshly created homework document with the context chip.
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('homework-context')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('homework-context')).toContainText(
      'Problem Set 1: Variables',
    );
  });

  // The exercise is polymorphic: it can be any imported source, not just a
  // typed note. Here we pick a course material (an imported file) as the
  // exercise. The chip names it by file_name, proving a file became the
  // exercise (its content is covered by RAG, not extracted verbatim).
  test('start homework with an imported file as the exercise', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await goToSeededCourse(page); // client-side navigation

    await page.getByRole('button', { name: /start homework/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Step 1 lists imported sources as radios; pick the course material
    // (shown by its label). Target the radio so we don't hit the Step-2
    // checkbox with the same name.
    await dialog
      .getByRole('radio', { name: 'Lecture 1: Intro to Programming' })
      .check();

    await page.getByRole('button', { name: /^start$/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });
    const chip = page.getByTestId('homework-context');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('lecture-1-slides.pdf');
  });
});
