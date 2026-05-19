import { type Page, type Route } from '@playwright/test';

/**
 * Intercept the LaTeX conversion endpoint and return a deterministic fixture
 * response so E2E tests don't need a real Gemini API key in CI.
 *
 * Pass a map of natural-language input → LaTeX output. The mock parses the
 * request body and returns the matching fixture, or a default fallback.
 *
 * Usage:
 *   await mockLatexConversion(page, {
 *     'x squared plus y': 'x^2 + y',
 *     'a in A': 'a \\in A',
 *   });
 */
export async function mockLatexConversion(
  page: Page,
  fixtures: Record<string, string>,
  fallback = '\\text{mocked}',
) {
  await page.route('**/api/ai/latex', async (route: Route) => {
    const req = route.request();
    if (req.method() !== 'POST') {
      await route.continue();
      return;
    }
    let text = '';
    try {
      const body = req.postDataJSON() as { text?: string } | null;
      text = (body?.text ?? '').trim();
    } catch {
      /* malformed body — fall through to fallback */
    }
    const latex = fixtures[text] ?? fallback;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ latex }),
    });
  });
}

/**
 * Mock the AI quota endpoint to return generous limits, in case a test
 * navigates to a screen that displays remaining quota.
 */
export async function mockAiQuota(
  page: Page,
  quota = {
    used: 0,
    limit: 1000,
    tier: 'beta',
    resetsAt: null as string | null,
  },
) {
  await page.route('**/api/ai/quota**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quota),
    });
  });
}
