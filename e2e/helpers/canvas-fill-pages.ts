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
  // Varied paragraph templates so each paragraph is visually distinct —
  // with identical text you can't tell which content ended up on which
  // page after a cascade. These are adapted from a real university
  // exercise sheet (Computational Models, Exercise 1) for realistic
  // line lengths and mixed formatting.
  const englishParagraphs = [
    'Computational Models — Exercise 1. Due Saturday, 4 April 2026.',
    'Each student must solve the problems on their own. If you encounter difficulties, you may ask a classmate for a hint or the general idea.',
    'However, detailed discussion, note-taking, or sharing of written solutions is not allowed. Do not write down your answers while communicating with other people.',
    'Our grading app has severe limitations, such as no zoom tool. To make sure we can grade your work, please follow these technical guidelines.',
    'Submit a single PDF file through Moodle. The file size is limited to 10 MB. If necessary, google reduce PDF file size.',
    'Fill in your answers on this form in the allocated spaces. The space provided gives you an indication of the expected length and level of detail.',
    'Include everything from this form in your submission. In particular, include the problem statements. Do not delete any text or omit pages.',
    'Ensure your answers are legible (easy to read) at zoom 100% on a standard computer screen. Your text should be large, sharp, and in high contrast.',
    'Do not squeeze scanned solutions to fit in the space, as the text will become small and hard to grade properly.',
    'Verify that pages are properly ordered and oriented. The page size must be A4 (21 × 29 cm).',
    'Before submitting your file, check its page size using Acrobat Reader: go to File > Properties > Description and confirm that Page Size is correct.',
    'Note that scanning A4 pages does not guarantee the resulting page size will be A4, due to scaling. If necessary, google resize PDF to A4.',
    'Do not add your answers as PDF comments. If you can drag them in Acrobat Reader, they are comments. If necessary, google flatten PDF.',
    'A 5-point bonus will be given to solutions typed in a word processor. Hand-sketched illustrations or diagrams will not deny you this bonus.',
    'If there are technical issues with your submission, you may receive a fine. In extreme cases, your submission may not be graded at all.',
    'If you need help or have questions, please use the course forum at Piazza. The TAs will respond within 24 hours.',
    'Problem 1: Read the instructions on page 1 carefully. Have you read the instructions on page 1 carefully?',
    'Problem 2: Write the elements of the following sets. For each set, list all members and explain why they belong.',
    'Problem 3: For each of the following languages, give a DFA that recognizes it. Draw the state diagram clearly.',
    'Problem 4: Prove or disprove: for every regular language L, the reverse of L is also regular.',
  ];
  const hebrewParagraphs = [
    'מודלים חישוביים — תרגיל 1. הגשה עד יום שבת, 4 באפריל 2026.',
    'על כל סטודנט לפתור את הבעיות בעצמו. אם נתקלתם בקשיים, ניתן לבקש רמז או רעיון כללי מחבר לכיתה.',
    'אולם, דיון מפורט, רישום הערות או שיתוף פתרונות כתובים אסור. אין לרשום תשובות תוך כדי תקשורת עם אנשים אחרים.',
    'מערכת הבדיקה שלנו מוגבלת ואין בה כלי זום. כדי שנוכל לבדוק את עבודתכם, עקבו אחר ההנחיות הטכניות הבאות.',
    'הגישו קובץ PDF יחיד דרך מודל. גודל הקובץ מוגבל ל-10 מגה-בייט. אם צריך, חפשו בגוגל הקטנת קובץ PDF.',
    'מלאו את התשובות בטופס הזה במקומות המיועדים. השטח שניתן מציין את האורך הצפוי ורמת הפירוט של התשובה.',
    'כללו הכל מהטופס הזה בהגשה שלכם. בפרט, כללו את ניסוחי הבעיות. אל תמחקו טקסט ואל תשמיטו עמודים.',
    'ודאו שהתשובות שלכם קריאות בזום 100% על מסך מחשב רגיל. הטקסט צריך להיות גדול, חד ובניגודיות גבוהה.',
    'אל תדחסו פתרונות סרוקים כדי שיתאימו לשטח, כי הטקסט יהפוך לקטן וקשה לקריאה.',
    'בדקו שהעמודים בסדר הנכון ובכיוון הנכון. גודל העמוד חייב להיות A4 (21 × 29 ס"מ).',
    'לפני הגשה, בדקו את גודל העמוד באמצעות Acrobat Reader: קובץ > מאפיינים > תיאור.',
    'שימו לב שסריקת דפי A4 לא מבטיחה שגודל העמוד שיתקבל יהיה A4, בגלל שינוי קנה מידה.',
    'אל תוסיפו תשובות כהערות PDF. אם אפשר לגרור אותן ב-Acrobat Reader, הן הערות. אם צריך, חפשו flatten PDF.',
    'בונוס של 5 נקודות יינתן לפתרונות שהוקלדו במעבד תמלילים. שרטוטים ביד חופשית לא ישללו את הבונוס.',
    'אם יש בעיות טכניות בהגשה שלכם, ייתכן שתקבלו קנס. במקרים קיצוניים, ההגשה עלולה שלא להיבדק כלל.',
    'אם אתם צריכים עזרה או יש לכם שאלות, השתמשו בפורום הקורס ב-Piazza. המתרגלים יענו תוך 24 שעות.',
    'בעיה 1: קראו את ההנחיות בעמוד 1 בקפידה. האם קראתם את ההנחיות בעמוד 1 בקפידה?',
    'בעיה 2: כתבו את האיברים של הקבוצות הבאות. עבור כל קבוצה, רשמו את כל החברים והסבירו למה הם שייכים.',
    'בעיה 3: לכל אחת מהשפות הבאות, תנו אוטומט דטרמיניסטי סופי שמזהה אותה. ציירו את דיאגרמת המצבים בבירור.',
    'בעיה 4: הוכיחו או הפריכו: לכל שפה רגולרית L, ההיפוך של L הוא גם שפה רגולרית.',
  ];
  const templates = language === 'he' ? hebrewParagraphs : englishParagraphs;
  const dir = language === 'he' ? 'rtl' : 'ltr';
  // 18 paragraphs × ~60px/paragraph ≈ 1080px of content, which just
  // exceeds the 1043px (PAGE_HEIGHT − tb.y − margin) overflow
  // threshold — so any additional character / paragraph WILL push
  // the page into overflow.
  const paragraphsPerPage = 18;

  // Global counter across all pages so every paragraph in the document
  // has a unique, traceable prefix (e.g., "P001", "P002", ...).
  let globalParagraphIndex = 0;
  const buildParagraph = () => {
    const idx = globalParagraphIndex++;
    const base = templates[idx % templates.length];
    return {
      type: 'paragraph',
      attrs: { dir, indent: 0, textAlign: null },
      content: [
        {
          type: 'text',
          text: `[P${String(idx + 1).padStart(3, '0')}] ${base}`,
        },
      ],
    };
  };

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
