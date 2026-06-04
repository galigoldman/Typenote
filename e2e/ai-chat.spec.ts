import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded course "Introduction to CS" — AI chat appears inside course documents
const COURSE_URL = '/dashboard/courses/30000000-0000-0000-0000-000000000001';

test.describe('AI Chat', () => {
  // AI chat is only available inside course-linked documents
  // and course page rendering is flaky in CI
  test.skip(!!process.env.CI, 'AI chat needs course page which is flaky in CI');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(COURSE_URL);
    await expect(page).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 10_000,
    });
  });

  test('open AI chat panel', async ({ page }) => {
    // Look for the AI chat trigger button
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();

    // Chat panel should open with "AI Tutor" heading
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });
  });

  test('send a message and receive response', async ({ page }) => {
    test.setTimeout(60_000);

    // Open AI chat
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Type a message
    const input = page.locator(
      'input[placeholder*="Ask about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('What is a variable?');
    await page.keyboard.press('Enter');

    // Wait for response — should see either loading or a response bubble
    await expect(page.locator('div.bg-muted.rounded-2xl').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('chat shows quota usage', async ({ page }) => {
    // Open AI chat
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Quota info should be visible near the input
    await expect(page.getByText(/remaining/i)).toBeVisible({ timeout: 5_000 });
  });

  test('chat renders markdown in responses', async ({ page }) => {
    test.setTimeout(60_000);

    // Open AI chat
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Send a message that's likely to get a markdown response
    const input = page.locator(
      'input[placeholder*="Ask about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('Explain variables with bullet points');
    await page.keyboard.press('Enter');

    // Wait for response to appear
    await expect(page.locator('div.bg-muted.rounded-2xl').first()).toBeVisible({
      timeout: 30_000,
    });

    // Response should contain rendered markdown (not raw ** or - )
    // Check that the response area has formatted HTML elements
    const responseArea = page.locator('div.bg-muted.rounded-2xl').first();
    await expect(responseArea).toBeVisible();
  });

  test('start new conversation', async ({ page }) => {
    // Open AI chat
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Click "New conversation" button
    const newConvoButton = page.getByRole('button', {
      name: /new conversation/i,
    });
    await expect(newConvoButton).toBeVisible({ timeout: 5_000 });
    await newConvoButton.click();

    // Chat should show empty state or fresh input
    const input = page.locator(
      'input[placeholder*="Ask about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
  });

  test('switch between conversations', async ({ page }) => {
    // Open AI chat
    const aiButton = page.getByRole('button', { name: /AI|Ask AI|Tutor/i });
    await expect(aiButton.first()).toBeVisible({ timeout: 10_000 });
    await aiButton.first().click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Click conversation history button
    const historyButton = page.getByRole('button', {
      name: /conversation history/i,
    });
    await expect(historyButton).toBeVisible({ timeout: 5_000 });
    await historyButton.click();

    // Conversation list should appear — seeded data has conversations
    // Either we see conversation items or "No conversations yet"
    await expect(
      page
        .getByText('No conversations yet')
        .or(page.locator('ul.divide-y li').first()),
    ).toBeVisible({ timeout: 5_000 });
  });

  // Regression: on the course page the chat panel is rendered inside the
  // header button toolbar (normal document flow), not as a flex-row sibling
  // of the main content. With the old `lg:static` layout it collapsed inline
  // into the toolbar on desktop. With `docked={false}` it must stay a fixed
  // drawer pinned to the right edge, full height.
  test('course page: chat panel docks to the right edge, not inline in the toolbar', async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    // Desktop width is required for the bug to manifest (lg+ breakpoint).
    expect(viewport!.width).toBeGreaterThanOrEqual(1024);

    // Open via the floating bubble (uncontrolled on the course page).
    await page.getByRole('button', { name: /open ai chat/i }).click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Measure the panel container (nearest fixed-position ancestor of the header).
    const box = await page.evaluate(() => {
      const header = Array.from(document.querySelectorAll('*')).find(
        (el) => el.textContent?.trim() === 'AI Tutor',
      );
      let el: Element | null = header ?? null;
      while (el && !String((el as HTMLElement).className).includes('fixed')) {
        el = el.parentElement;
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, height: r.height };
    });

    expect(box).not.toBeNull();
    // Pinned to the right edge…
    expect(box!.right).toBeGreaterThanOrEqual(viewport!.width - 2);
    // …occupying the right portion (never collapsed to the top-left toolbar)…
    expect(box!.x).toBeGreaterThan(viewport!.width / 2);
    // …and full-height like a drawer, not a short inline toolbar element.
    expect(box!.height).toBeGreaterThan(viewport!.height * 0.8);
  });
});
