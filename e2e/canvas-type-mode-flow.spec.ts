import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// Seeded canvas document. The `pages` column defaults to `{"pages":[]}` in
// migration 00007, so this document renders in CanvasEditor with one empty
// page and the default tool is 'text' (flow editor mode). This is the exact
// surface where issue #118 reproduces.
const DOC_URL = '/dashboard/documents/20000000-0000-0000-0000-000000000001';

/**
 * Focus the first page's flow editor (ProseMirror) and place the cursor
 * inside it. We use `locator.focus()` rather than `click()` because the
 * canvas page has several overlapping absolute-positioned layers whose
 * actionability checks can obscure the editor for Playwright even though
 * the editor is the one that receives real user clicks in the browser.
 * `focus()` calls `.focus()` directly on the DOM element, bypassing the
 * point-based actionability heuristic entirely.
 *
 * The flow editor is rendered when a page has no text boxes, which is the
 * case for a freshly-loaded seeded doc in this test.
 */
async function focusFlowEditor(page: Page) {
  const editor = page
    .locator('[data-page-id]')
    .first()
    .locator('.ProseMirror')
    .first();
  await editor.waitFor({ state: 'visible' });
  await editor.focus();
}

/**
 * Insert plain text into the currently focused contenteditable via the
 * browser's native `insertText` execCommand. ProseMirror/TipTap listens for
 * the resulting `beforeinput` events and applies the insertion as if the
 * user had typed or pasted the text, but does so in a single transaction
 * instead of one per character — which makes the test fast enough for CI.
 */
async function insertText(page: Page, text: string) {
  await page.evaluate((t) => {
    document.execCommand('insertText', false, t);
  }, text);
}

/**
 * Insert a list of paragraphs into the focused editor, pressing Enter
 * between each to produce separate block nodes.
 */
async function insertParagraphs(page: Page, paragraphs: string[]) {
  for (let i = 0; i < paragraphs.length; i++) {
    await insertText(page, paragraphs[i]);
    if (i < paragraphs.length - 1) {
      await page.keyboard.press('Enter');
    }
  }
}

test.describe('Canvas Editor — Type mode text reflow (issue #118)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(DOC_URL);

    // Wait for canvas editor to mount.
    await expect(page.locator('[data-page-id]').first()).toBeVisible({
      timeout: 15_000,
    });

    // The initial canvas page has an empty flow editor (no text boxes). The
    // default tool is 'text' so the flow editor is immediately editable.
    await expect(
      page.locator('[data-page-id]').first().locator('.ProseMirror').first(),
    ).toBeVisible();
  });

  test('multi-paragraph input overflows from page 1 onto a newly-created page 2', async ({
    page,
  }) => {
    await focusFlowEditor(page);

    // 20 non-trivial paragraphs — definitely more than fits on one A4 page.
    // Each paragraph is long enough to wrap to 2 lines in the default prose
    // font, so at ~20 paragraphs × 2 lines × 24px line-height ≈ 960px of
    // content — plus paragraph margins pushes it past the 1123px page height.
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) =>
        `Paragraph ${i + 1} — lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.`,
    );
    await insertParagraphs(page, paragraphs);

    // Allow the overflow cascade to settle. The fix dispatches the flow in a
    // requestAnimationFrame chain, so a short wait is sufficient.
    await page.waitForTimeout(1500);

    // Core assertion for issue #118: there must now be at least 2 pages.
    const pageCount = await page.locator('[data-page-id]').count();
    expect(pageCount).toBeGreaterThanOrEqual(2);

    // The first paragraph must still be visible on page 1 (confirming we
    // split at a block boundary, not mid-document).
    await expect(
      page
        .locator('[data-page-id]')
        .first()
        .getByText(/^Paragraph 1 —/),
    ).toBeVisible();

    // The last paragraph must be visible somewhere in the document — proving
    // no characters were lost during the overflow cascade.
    await expect(
      page
        .locator('[data-page-id]')
        .getByText(/^Paragraph 20 —/)
        .first(),
    ).toBeVisible();
  });

  test('the page text layer clips overflow so spilled/pasted text never renders past the page edge', async ({
    page,
  }) => {
    // Regression guard for the abbe925 change that flipped this layer from
    // overflow-hidden to overflow-visible (to un-clip LaTeX menus, which are
    // now portaled to document.body instead). With overflow-visible, content
    // that overflows the fixed-height page — e.g. a large paste before the
    // reflow settles, or a single un-splittable block — paints OUTSIDE the
    // page boundary. The text layer must clip.
    const textLayer = page
      .locator('[data-page-id]')
      .first()
      .locator('[data-text-layer]');
    await expect(textLayer).toBeAttached();

    const overflow = await textLayer.evaluate(
      (el) => getComputedStyle(el).overflow,
    );
    // 'hidden' or 'clip' both clip; 'visible' is the regression.
    expect(overflow).not.toBe('visible');
  });

  test('a long URL with no word boundaries wraps inside the page instead of being clipped', async ({
    page,
  }) => {
    await focusFlowEditor(page);

    // 300-character word with no spaces, hyphens, slashes, or dots — NOTHING
    // the browser can use as a natural break point. Without `break-words`
    // (CSS `overflow-wrap: break-word`), this string extends past the right
    // edge of the editor container and is visually clipped by the text
    // layer's `overflow-hidden`. Using repeated letters (not hyphens/slashes)
    // is important because modern browsers already break URLs at those
    // separators as a soft-wrap opportunity.
    const longWord = 'x'.repeat(300);
    await insertText(page, longWord);

    // Small settle time for layout.
    await page.waitForTimeout(200);

    // The editor element's `scrollWidth` must be <= its `clientWidth`.
    // If the long URL extends past the right edge (no wrap), scrollWidth
    // will exceed clientWidth and this assertion fails.
    const editor = page
      .locator('[data-page-id]')
      .first()
      .locator('.ProseMirror')
      .first();
    const { scrollWidth, clientWidth } = await editor.evaluate((el) => ({
      scrollWidth: (el as HTMLElement).scrollWidth,
      clientWidth: (el as HTMLElement).clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
