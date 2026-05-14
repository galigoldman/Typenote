/**
 * Security: prompt-injection resistance in AI chat responses.
 *
 * Threat model: An LLM can be coaxed (intentionally or accidentally) into
 * emitting raw HTML in its response — `<script>`, `<img onerror>`, etc.
 * If the chat panel ever switches its markdown renderer to allow raw HTML
 * (e.g. by adding `rehype-raw`), an attacker who controls course content
 * or the user's own prior chat history could persist a payload that
 * executes inside another session.
 *
 * `react-markdown` defaults to NOT rendering raw HTML, but that's a
 * single dependency-config flip from breaking. These tests pin the
 * behavior end-to-end.
 *
 * Strategy:
 *   - Mock /api/ai/ask to stream back a deterministic SSE response
 *     containing common HTML/JS payloads.
 *   - Send any question through the real chat UI.
 *   - Assert: payload text is visible as text; no dialog fires;
 *     no sentinel global was set.
 */
import { test, expect, type Dialog } from '@playwright/test';
import { login } from './helpers/auth';
import { goToSeededCourse } from './helpers/navigate';

const PAYLOADS = {
  scriptTag: '<script>window.__pi_fired_1=true;alert(1)</script>',
  imgOnerror: '<img src=x onerror="window.__pi_fired_2=true">',
  svgOnload: '<svg onload="window.__pi_fired_3=true"></svg>',
};

/** Build a single SSE stream that the chat panel will parse and render. */
function buildSseBody(text: string): string {
  // The client splits on \n\n and parses lines starting with "data: ".
  const event = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  return [
    event({ type: 'sources', sources: [], model: 'flash' }),
    event({ type: 'text', text }),
  ].join('');
}

test.describe('Security — prompt-injection resistance in AI chat', () => {
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

    // Suppress conversation history so the chat opens empty — keeps the
    // test deterministic regardless of any stored conversations from
    // previous E2E runs.
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
    await page.goto('/dashboard');
    await goToSeededCourse(page);
  });

  test('AI response containing <script>/<img onerror>/<svg onload> renders as text and does NOT execute', async ({
    page,
  }) => {
    // Capture any dialog as a hard failure signal.
    const dialogs: Dialog[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d);
      await d.dismiss();
    });

    const responseText = [
      'Here is some content:',
      PAYLOADS.scriptTag,
      PAYLOADS.imgOnerror,
      PAYLOADS.svgOnload,
      'End.',
    ].join('\n\n');

    // Mock the chat endpoint to stream back the injection payload.
    await page.route('**/api/ai/ask', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSseBody(responseText),
      });
    });

    // Open the chat bubble.
    const openChat = page.getByRole('button', { name: 'Open AI chat' });
    await expect(openChat).toBeVisible({ timeout: 10_000 });
    await openChat.click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    // Send any question — the response is mocked, the content doesn't matter.
    const input = page.locator('input[placeholder*="course materials"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('hello');
    await page.keyboard.press('Enter');

    // Wait for the assistant response bubble to appear.
    // Assistant-rendered markdown lives in a `.prose` wrapper produced by
    // <MarkdownResponse>. The streaming and the finalized message both
    // render it. The mocked response is the most-recent assistant bubble
    // — use `.last()` so any stored conversation history doesn't shadow it.
    const responseBubble = page.locator('div.prose').last();
    await expect(responseBubble).toBeVisible({ timeout: 10_000 });

    // Wait for the streamed text to settle (the "End." marker confirms the
    // full payload was processed).
    await expect(responseBubble).toContainText('End.', { timeout: 5_000 });

    // The payload text must be visible as TEXT in the rendered bubble.
    // react-markdown escapes raw HTML, so the literal `<script>` characters
    // appear as text content.
    const bubbleText = await responseBubble.textContent();
    expect(bubbleText).toContain('<script>');
    expect(bubbleText).toContain('onerror');

    // None of the payloads' sentinel side-effects must have happened.
    const fired = await page.evaluate(() => ({
      f1: (window as unknown as { __pi_fired_1?: boolean }).__pi_fired_1,
      f2: (window as unknown as { __pi_fired_2?: boolean }).__pi_fired_2,
      f3: (window as unknown as { __pi_fired_3?: boolean }).__pi_fired_3,
    }));
    expect(fired.f1).toBeFalsy();
    expect(fired.f2).toBeFalsy();
    expect(fired.f3).toBeFalsy();
    expect(dialogs).toHaveLength(0);

    // Defense-in-depth: assert no live <script> in the bubble subtree
    // (react-markdown should never emit one from response markdown).
    const scriptCount = await responseBubble.evaluate(
      (el) => el.querySelectorAll('script').length,
    );
    expect(scriptCount).toBe(0);
  });

  test('markdown-link with javascript: URL in AI response does not become a clickable execution sink', async ({
    page,
  }) => {
    const dialogs: Dialog[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d);
      await d.dismiss();
    });

    // A standard markdown link with a javascript: URL. react-markdown sanitizes
    // URL protocols on `<a>` by default and replaces `javascript:` with a
    // safe placeholder. This test pins that behavior.
    const responseText = '[click me](javascript:window.__pi_fired_4=true)';

    await page.route('**/api/ai/ask', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSseBody(responseText),
      });
    });

    const openChat = page.getByRole('button', { name: 'Open AI chat' });
    await expect(openChat).toBeVisible({ timeout: 10_000 });
    await openChat.click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    const input = page.locator('input[placeholder*="course materials"]');
    await input.fill('hello');
    await page.keyboard.press('Enter');

    // Assistant-rendered markdown lives in a `.prose` wrapper produced by
    // <MarkdownResponse>. The streaming and the finalized message both
    // render it. The mocked response is the most-recent assistant bubble
    // — use `.last()` so any stored conversation history doesn't shadow it.
    const responseBubble = page.locator('div.prose').last();
    await expect(responseBubble).toBeVisible({ timeout: 10_000 });
    await expect(responseBubble).toContainText('click me', { timeout: 5_000 });

    // Find the rendered link and check its href.
    const link = responseBubble.locator('a', { hasText: 'click me' }).first();
    const href = await link.getAttribute('href');
    // react-markdown's default URL sanitizer replaces javascript: with
    // `javascript:void(0)` or strips the protocol — either way, clicking
    // must NOT execute. The cleanest assertion is: no live javascript:
    // protocol survives.
    expect(href ?? '').not.toMatch(/^javascript:/i);

    // Attempt the click; nothing should fire.
    await link.click().catch(() => {
      /* link may be inert — that's a successful sanitization outcome */
    });

    const fired = await page.evaluate(
      () => (window as unknown as { __pi_fired_4?: boolean }).__pi_fired_4,
    );
    expect(fired).toBeFalsy();
    expect(dialogs).toHaveLength(0);
  });
});
