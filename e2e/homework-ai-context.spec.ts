import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded homework document (supabase/seed.sql): a homework_sessions row links
// this doc to the exercise "Problem Set 1: Variables" and pins the course
// material "Lecture 1: Intro to Programming". Opening the doc directly
// exercises the real homework-context feature (server-resolved chip + AI
// plumbing) without depending on the course page, whose Start Homework dialog
// is flaky in CI (see ai-chat.spec.ts). The Gemini call is mocked, so no
// GOOGLE_GENERATIVE_AI_API_KEY is needed — the context-building logic itself
// is covered by unit + integration tests.
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
});
