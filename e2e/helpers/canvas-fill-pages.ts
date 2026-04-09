import type { Page, APIRequestContext } from '@playwright/test';
import { expect, request as playwrightRequest } from '@playwright/test';

/**
 * UUID of the seeded document used as the target for multi-page cascade
 * tests. Prior test runs can leave behind dirty state in this doc's
 * `pages` JSONB column, so the fixture explicitly resets it to a clean
 * (single empty `-ftb` text box) state before each run via the local
 * Supabase REST API using the service-role key.
 */
const SEEDED_DOC_ID = '20000000-0000-0000-0000-000000000001';
const EMPTY_DOC_URL = `/dashboard/documents/${SEEDED_DOC_ID}`;

/** Local Supabase URL — must match the dev setup in `.env.local`. */
const SUPABASE_URL = 'http://127.0.0.1:54321';
/**
 * Local Supabase service-role key, hard-coded to the well-known local
 * default (matches `.env.local.example` and `supabase/config.toml`).
 * This key is ONLY for the local dev Supabase — it is the same public
 * key shipped with every `supabase start` and has no security impact.
 */
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Reset the seeded test document via the Supabase REST API to a known
 * multi-page state where each page has a `-ftb` text box packed nearly
 * to its overflow threshold. This pre-builds the exact state we want
 * to test AGAINST — we do NOT rely on the (buggy) overflow cascade to
 * build the fixture, which would be circular.
 *
 * Each page holds one text box with `paragraphsPerPage` duplicate
 * paragraphs of the chosen language. The empirical value of
 * `paragraphsPerPage` is chosen so each page's rendered content sits
 * within ~1 line of its overflow threshold, so that a single extra
 * empty paragraph (Enter at end of page) is guaranteed to trigger a
 * cascade.
 */
async function resetSeededDocWithPages(
  pageCount: number,
  language: 'en' | 'he',
): Promise<void> {
  const templateEN =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  const templateHE =
    'ליווית אותי המוזיקה כשהלכתי ברחוב, הצלילים מילאו את האוויר ואת הלב שלי בחיוך קטן.';
  const template = language === 'he' ? templateHE : templateEN;
  const dir = language === 'he' ? 'rtl' : 'ltr';
  // 18 paragraphs × ~60px/paragraph ≈ 1080px of content, which just
  // exceeds the 1043px (PAGE_HEIGHT − tb.y − margin) overflow
  // threshold — so any additional character / paragraph WILL push
  // the page into overflow.
  const paragraphsPerPage = 18;

  const buildParagraph = () => ({
    type: 'paragraph',
    attrs: { dir, indent: 0, textAlign: null },
    content: [{ type: 'text', text: template }],
  });

  const pages: Record<string, unknown>[] = [];
  for (let i = 0; i < pageCount; i++) {
    const pageId = `${SEEDED_DOC_ID}-p${i}`;
    const paragraphs = Array.from(
      { length: paragraphsPerPage },
      buildParagraph,
    );
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
          // Height is recalculated on mount; give a safe value that won't
          // cause the overflow detector to fire before content is rendered.
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
        `[canvas-fill-pages] resetSeededDocWithPages failed: ${response.status()} ${await response.text()}`,
      );
    }
  } finally {
    await req.dispose();
  }
}

interface FillOptions {
  /** Target approximate page count after the cascade has settled. */
  pages: number;
  /** Content language (affects the paragraph template). */
  language?: 'en' | 'he';
}

/**
 * Opens a seeded empty document and fills it with enough dense text to
 * produce `opts.pages` near-full pages. The user must already be logged
 * in via the `login` helper before calling this.
 *
 * Implementation approach — why paste, not typing:
 * - `page.keyboard.type` dispatches one keydown per character, which
 *   in a prose editor fires one onUpdate per character — for 9 pages
 *   of content that's ~10 000 synchronous React renders and cascade
 *   checks. Slow and noisy.
 * - A single synthetic ClipboardEvent dispatched on the ProseMirror
 *   root is processed as one atomic paste by TipTap, which inserts
 *   all the text in a single transaction. The overflow cascade then
 *   splits the content across pages in the same synchronous frame.
 * - This path intentionally uses the (already-fixed on this branch)
 *   content-preservation behaviour of the cascade. We do NOT rely on
 *   correct cursor behaviour during the fixture setup — the test
 *   proper explicitly re-positions the cursor before the assertion.
 *
 * After the paste, the helper waits until the DOM contains at least
 * `opts.pages` `[data-page-id]` elements, then waits one animation
 * frame of stillness so any trailing cascade hops can settle.
 */
export async function createDocumentWithNearFullPages(
  page: Page,
  opts: FillOptions,
): Promise<void> {
  const pages = opts.pages;
  const language = opts.language ?? 'en';

  // Pre-build the multi-page document directly via the Supabase REST
  // API. This bypasses the paste cascade entirely and gives us a
  // deterministic starting state where each page has exactly the same
  // number of paragraphs and is packed to ~1 line below its overflow
  // threshold.
  await resetSeededDocWithPages(pages, language);

  // Open the seeded (now-prepopulated) canvas doc.
  await page.goto(EMPTY_DOC_URL);

  // Wait for all pre-built text box editors to mount.
  await expect
    .poll(
      () => page.locator('[data-textbox-id$="-ftb"] .ProseMirror').count(),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(pages);

  // One extra stable frame so ResizeObserver has settled on the final
  // heights.
  await waitForCascadeSettled(page);
}

/**
 * Wait until any in-progress overflow cascade has fully settled.
 *
 * This is a deterministic replacement for `waitForTimeout(300)` that was
 * previously used as a heuristic. We wait for two consecutive animation
 * frames where the DOM's `[data-page-id]` count is stable — at that
 * point any ResizeObserver-driven cascade hops have already fired.
 */
export async function waitForCascadeSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let lastCount = document.querySelectorAll('[data-page-id]').length;
        let stableFrames = 0;
        const tick = () => {
          const count = document.querySelectorAll('[data-page-id]').length;
          if (count === lastCount) {
            stableFrames += 1;
            if (stableFrames >= 2) {
              resolve();
              return;
            }
          } else {
            stableFrames = 0;
            lastCount = count;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/**
 * Get the `data-page-id` of the page element that currently contains
 * the text caret.
 *
 * Strategy: prefer the window selection's anchor node (because that
 * tracks the caret position inside a specific paragraph even when
 * multiple editors exist), but fall back to `document.activeElement`
 * when the selection is empty — TipTap's `focus()` command sets DOM
 * focus without always populating a window selection range, so
 * relying on the selection alone would report `null` after a
 * cursor-target move.
 *
 * Used by the cursor-position assertions.
 */
export async function getActivePageId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const walkUp = (node: Node | null): string | null => {
      let el: HTMLElement | null =
        node?.nodeType === Node.ELEMENT_NODE
          ? (node as HTMLElement)
          : (node?.parentElement ?? null);
      while (el && !el.hasAttribute('data-page-id')) {
        el = el.parentElement;
      }
      return el?.getAttribute('data-page-id') ?? null;
    };
    const sel = window.getSelection();
    const anchor = sel?.anchorNode as Node | null;
    if (anchor) {
      const fromAnchor = walkUp(anchor);
      if (fromAnchor) return fromAnchor;
    }
    return walkUp(document.activeElement as Node | null);
  });
}

/**
 * Place the cursor at the END of the last block of the Nth page's
 * prose editor. `pageIndex` is 0-based.
 *
 * Works for both linked text boxes (`-ftb`) and legacy flow editors
 * (which are rendered on brand-new cascade-created pages until the
 * user triggers the flow-content → text-box migration). The selector
 * walks into the page container and takes the first `.ProseMirror`
 * descendant.
 *
 * Implementation: uses the Selection API to set a collapsed range at
 * the end of the last child of the page's `.ProseMirror` element,
 * then calls `focus()` on that ProseMirror element so the editor's
 * internal state syncs to the new selection via ProseMirror's
 * `selectionchange` listener.
 */
export async function setCursorAtEndOfPage(
  page: Page,
  pageIndex: number,
): Promise<void> {
  await page.evaluate((idx: number) => {
    const pageEls = document.querySelectorAll(
      '[data-page-id]',
    ) as NodeListOf<HTMLElement>;
    const pageEl = pageEls[idx];
    if (!pageEl)
      throw new Error(`[setCursorAtEndOfPage] no page at index ${idx}`);
    const pm = pageEl.querySelector('.ProseMirror') as HTMLElement | null;
    if (!pm) throw new Error('[setCursorAtEndOfPage] no ProseMirror in page');
    const children = pm.children;
    if (children.length === 0)
      throw new Error('[setCursorAtEndOfPage] ProseMirror is empty');
    const lastBlock = children[children.length - 1] as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(lastBlock);
    range.collapse(false); // collapse to END
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    pm.focus();
  }, pageIndex);
}

/**
 * Place the cursor in the MIDDLE of the middle block of the Nth
 * page's prose editor. "Middle" is defined as the midpoint of the
 * text content of the `Math.floor(childCount / 2)`-th child. This is
 * explicitly NOT the last block of the page, so pressing Enter at
 * this position creates a new block that stays on the current page —
 * exercising the middle-of-page rule from FR-003.
 */
export async function setCursorInMiddleOfPage(
  page: Page,
  pageIndex: number,
): Promise<void> {
  await page.evaluate((idx: number) => {
    const pageEls = document.querySelectorAll(
      '[data-page-id]',
    ) as NodeListOf<HTMLElement>;
    const pageEl = pageEls[idx];
    if (!pageEl)
      throw new Error(`[setCursorInMiddleOfPage] no page at index ${idx}`);
    const pm = pageEl.querySelector('.ProseMirror') as HTMLElement | null;
    if (!pm)
      throw new Error('[setCursorInMiddleOfPage] no ProseMirror in page');
    const children = pm.children;
    if (children.length === 0)
      throw new Error('[setCursorInMiddleOfPage] ProseMirror is empty');
    // Skip the very last block so the split is strictly INSIDE the page
    // (so the spec's "middle of page" rule applies).
    const targetIndex = Math.max(
      0,
      Math.min(Math.floor(children.length / 2), children.length - 2),
    );
    const middleBlock = children[targetIndex] as HTMLElement;
    const textNode = middleBlock.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE)
      throw new Error('[setCursorInMiddleOfPage] middle block has no text');
    const text = textNode.textContent ?? '';
    const midOffset = Math.floor(text.length / 2);
    const range = document.createRange();
    range.setStart(textNode, midOffset);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    pm.focus();
  }, pageIndex);
}

/**
 * Count how many `[data-page-id]` page containers currently exist in
 * the DOM. Used to assert that a new page was created (or not) by a
 * cascade.
 */
export async function pageCount(page: Page): Promise<number> {
  return page.locator('[data-page-id]').count();
}
