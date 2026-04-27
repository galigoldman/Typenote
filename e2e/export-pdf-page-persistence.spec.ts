import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E test: pages must persist after PDF export.
 *
 * Reproduces a bug where pages were silently lost after export due to:
 * - Auto-save stripping pages it considers "empty" (math-only content)
 * - Server Action body size limit (>1MB documents failed silently)
 * - Realtime echo overwriting local state with stale DB data
 *
 * Strategy: pre-build a 6-page document via the Supabase REST API,
 * navigate to it, trigger the export, wait, and verify all 6 pages
 * are still in the DOM.
 */

const SEEDED_DOC_ID = '20000000-0000-0000-0000-000000000001';
const DOC_URL = `/dashboard/documents/${SEEDED_DOC_ID}`;
const SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TARGET_PAGES = 6;

/**
 * Build a 6-page document where each page has real content (mix of
 * text and math expressions) and seed it via the Supabase REST API.
 */
async function seedDocumentWithPages(): Promise<void> {
  const pages: Record<string, unknown>[] = [];

  for (let i = 0; i < TARGET_PAGES; i++) {
    const pageId = `${SEEDED_DOC_ID}-p${i}`;
    const paragraphs = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Page ${i + 1} content.` }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'mathExpression',
            attrs: { latex: `x^{${i + 1}} + y = ${i + 1}` },
          },
        ],
      },
      ...Array.from({ length: 8 }, (_, j) => ({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Line ${j + 1} of page ${i + 1}: The quick brown fox jumps over the lazy dog.`,
          },
        ],
      })),
    ];

    pages.push({
      id: pageId,
      order: i,
      strokes: [],
      pageType: 'lined',
      textBoxes: [
        {
          id: `${pageId}-ftb`,
          x: 40,
          y: 40,
          width: 714,
          height: 60,
          content: { type: 'doc', content: paragraphs },
          isFullPage: false,
          zIndex: 0,
        },
      ],
      flowContent: null,
    });
  }

  const req: APIRequestContext = await playwrightRequest.newContext();
  try {
    const response = await req.patch(
      `${SUPABASE_URL}/rest/v1/documents?id=eq.${SEEDED_DOC_ID}`,
      {
        headers: {
          apikey: LOCAL_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        data: JSON.stringify({ pages: { pages } }),
      },
    );
    if (!response.ok()) {
      throw new Error(
        `seedDocumentWithPages failed: ${response.status()} ${await response.text()}`,
      );
    }
  } finally {
    await req.dispose();
  }
}

test.describe('Page persistence after PDF export', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await seedDocumentWithPages();
  });

  test('all 6 pages remain after export and waiting', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(DOC_URL);

    // Wait for all 6 page containers to render
    await expect
      .poll(() => page.locator('[data-page-id]').count(), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(TARGET_PAGES);

    const pageCountBefore = await page.locator('[data-page-id]').count();
    expect(pageCountBefore).toBeGreaterThanOrEqual(TARGET_PAGES);

    // Auto-close the print popup so the test can proceed
    page.on('popup', async (popup) => {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.close().catch(() => {});
    });

    const exportBtn = page.locator('button[title="Export as PDF"]');
    await exportBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await exportBtn.click();

    // Wait for export to finish
    await expect(exportBtn).not.toBeDisabled({ timeout: 15_000 });

    // Wait for auto-save + Realtime echo cycle to complete
    await page.waitForTimeout(30_000);

    // Verify all pages are still present
    const pageCountAfter = await page.locator('[data-page-id]').count();
    expect(pageCountAfter).toBeGreaterThanOrEqual(TARGET_PAGES);
  });
});
