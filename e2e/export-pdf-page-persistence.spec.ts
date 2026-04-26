import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E test: pages must persist after PDF export.
 *
 * Reproduces a bug where trailing pages with math/LaTeX content were
 * silently stripped during auto-save, and the Realtime echo could
 * overwrite local state with the stripped DB version — causing pages
 * to disappear from the editor after export.
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
    // Mix text and math content so the test covers both content types
    const paragraphs = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Page ${i + 1} — content paragraph.` }],
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
      // Add enough text paragraphs to make the page non-trivial
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
    // Give plenty of time — the bug manifests "after a while"
    test.setTimeout(180_000);

    // Navigate to the seeded document
    await page.goto(DOC_URL);

    // Wait for all 6 page containers to render
    await expect
      .poll(() => page.locator('[data-page-id]').count(), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(TARGET_PAGES);

    // Verify text content is visible on the first and last content pages
    await expect(page.getByText('Page 1 — content paragraph.')).toBeVisible();

    // Record page count before export
    const pageCountBefore = await page.locator('[data-page-id]').count();
    expect(pageCountBefore).toBeGreaterThanOrEqual(TARGET_PAGES);

    // Click the export button (opens print dialog in a popup window)
    // Use page.on to auto-close any popup windows so the test can proceed
    page.on('popup', async (popup) => {
      // Close the popup after a brief delay — don't actually print
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.close().catch(() => {});
    });

    await page.locator('button[title="Export as PDF"]').click();

    // Wait for the export to complete (isExporting → false)
    await expect(
      page.locator('button[title="Export as PDF"]'),
    ).not.toBeDisabled({ timeout: 15_000 });

    // Now wait a significant amount of time — the bug manifests "after a while"
    // because it depends on auto-save timing and Realtime echo arrival.
    // 60 seconds is a CI-friendly compromise.
    await page.waitForTimeout(60_000);

    // Verify all pages are still present
    const pageCountAfter = await page.locator('[data-page-id]').count();
    expect(pageCountAfter).toBeGreaterThanOrEqual(TARGET_PAGES);

    // Verify content is still visible
    await expect(page.getByText('Page 1 — content paragraph.')).toBeVisible();
  });
});
