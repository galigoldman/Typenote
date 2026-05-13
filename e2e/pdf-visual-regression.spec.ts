import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { login } from './helpers/auth';
import { upsertFixtureDocument, type FixtureDocument } from './helpers/db';
import { neuterPopupPrint, settlePopup } from './helpers/pdf-export';

const A4_VIEWPORT = { width: 794, height: 1123 };

// ───────────────────────────────────────────────────────────────────────────
// Fixtures — each test owns a doc with stable, hand-crafted content. We do
// not rely on supabase/seed.sql here because the editor's autosave can
// mutate seeded docs across runs, which makes baselines flake.
// ───────────────────────────────────────────────────────────────────────────

const FIXTURE_BASIC: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000001',
  title: 'Basic Text — Headings, Paragraph, Bullet List',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: [{ type: 'text', text: 'Calculus Notes' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'A short paragraph to test plain text wrap.' },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2, textAlign: null },
        content: [{ type: 'text', text: 'Key Definitions' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'bold' }],
                    text: 'Limit:',
                  },
                  {
                    type: 'text',
                    text: ' f(x) approaches L as x approaches a.',
                  },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'bold' }],
                    text: 'Continuity:',
                  },
                  {
                    type: 'text',
                    text: ' f is continuous at a if lim f(x) = f(a).',
                  },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'bold' }],
                    text: 'Squeeze Theorem:',
                  },
                  {
                    type: 'text',
                    text: ' bound a function between two convergent ones.',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const FIXTURE_MATH: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000002',
  title: 'Math — Inline KaTeX',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: [{ type: 'text', text: 'Math Rendering' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Pythagoras: ' },
          {
            type: 'mathExpression',
            attrs: { latex: 'a^2 + b^2 = c^2', originalText: ':{a^2+b^2=c^2}' },
          },
          { type: 'text', text: ' applies to any right triangle.' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'A simple fraction: ' },
          {
            type: 'mathExpression',
            attrs: { latex: '\\frac{1}{2}', originalText: ':{1/2}' },
          },
          { type: 'text', text: ' and an integral: ' },
          {
            type: 'mathExpression',
            attrs: {
              latex: '\\int_0^1 x^2 \\, dx',
              originalText: ':{int 0 to 1 x^2 dx}',
            },
          },
          { type: 'text', text: '.' },
        ],
      },
    ],
  },
};

const FIXTURE_MATH_IN_STRUCTURE: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000004',
  title: 'Math inside headings and list items',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: [
          { type: 'text', text: 'Solving ' },
          {
            type: 'mathExpression',
            attrs: { latex: 'ax^2 + bx + c = 0', originalText: '' },
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'The quadratic formula gives both roots in one expression:',
          },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'The formula: ' },
                  {
                    type: 'mathExpression',
                    attrs: {
                      latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
                      originalText: '',
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Discriminant: ' },
                  {
                    type: 'mathExpression',
                    attrs: {
                      latex: '\\Delta = b^2 - 4ac',
                      originalText: '',
                    },
                  },
                  { type: 'text', text: '.' },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Sum of roots: ' },
                  {
                    type: 'mathExpression',
                    attrs: {
                      latex: 'x_1 + x_2 = -\\frac{b}{a}',
                      originalText: '',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const FIXTURE_INVALID_LATEX: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000005',
  title: 'Invalid LaTeX — error fallback rendering',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: [{ type: 'text', text: 'When KaTeX cannot parse' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Unbalanced braces: ' },
          {
            type: 'mathExpression',
            attrs: { latex: '\\frac{a}{', originalText: '' },
          },
          { type: 'text', text: ' (should render an error).' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Unknown command: ' },
          {
            type: 'mathExpression',
            attrs: { latex: '\\thiscommanddoesnotexist{x}', originalText: '' },
          },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Empty math: ' },
          {
            type: 'mathExpression',
            attrs: { latex: '', originalText: '' },
          },
          { type: 'text', text: '.' },
        ],
      },
    ],
  },
};

const FIXTURE_LONG_TEXT: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000006',
  title: 'Long text — page-break behaviour',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: [{ type: 'text', text: 'A Long Document' }],
      },
      // 12 paragraphs of identical-but-deterministic text. Enough to wrap and
      // cross page-break boundaries; not enough to take forever to render.
      ...Array.from({ length: 12 }, (_, i) => ({
        type: 'paragraph' as const,
        content: [
          {
            type: 'text' as const,
            text:
              `Paragraph ${i + 1}. ` +
              'This paragraph exists to verify that long-form text wraps at the A4 ' +
              'page width without truncation and survives the page-break boundary. ' +
              'Each line should fit cleanly without cutting words; the export ' +
              'pipeline must preserve every paragraph in order, with consistent ' +
              'line height and margin spacing throughout the document.',
          },
        ],
      })),
    ],
  },
};

function buildCanvasPage(
  id: string,
  order: number,
  strokes: Array<{ points: Array<[number, number]>; color?: string }>,
): unknown {
  return {
    id,
    order,
    pageType: 'lined',
    strokes: strokes.map((s, i) => {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      return {
        id: `stroke-${id}-${i}`,
        points: s.points.map(([x, y]) => [x, y, 0.5]),
        color: s.color ?? '#1a1a1a',
        width: 3,
        opacity: 1,
        bbox: {
          minX: Math.min(...xs) - 5,
          minY: Math.min(...ys) - 5,
          maxX: Math.max(...xs) + 5,
          maxY: Math.max(...ys) + 5,
        },
        createdAt: 1_700_000_000_000 + i * 1000,
      };
    }),
    textBoxes: [],
    images: [],
    flowContent: null,
  };
}

// Two strokes forming an "X" pattern on a single page.
const FIXTURE_CANVAS_STROKES: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000007',
  title: 'Canvas — pen strokes (X pattern)',
  canvas_type: 'lined',
  content: { type: 'doc', content: [] },
  pages: {
    pages: [
      buildCanvasPage('p1', 0, [
        {
          // Diagonal: top-left to bottom-right
          points: [
            [150, 150],
            [200, 200],
            [250, 250],
            [300, 300],
            [350, 350],
            [400, 400],
            [450, 450],
          ],
          color: '#1a1a1a',
        },
        {
          // Diagonal: top-right to bottom-left
          points: [
            [450, 150],
            [400, 200],
            [350, 250],
            [300, 300],
            [250, 350],
            [200, 400],
            [150, 450],
          ],
          color: '#ef4444',
        },
      ]),
    ],
  },
};

// Two pages: page 1 has a horizontal stroke, page 2 has a vertical stroke.
const FIXTURE_CANVAS_MULTIPAGE: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000008',
  title: 'Canvas — multi-page document',
  canvas_type: 'blank',
  content: { type: 'doc', content: [] },
  pages: {
    pages: [
      buildCanvasPage('mp1', 0, [
        {
          points: [
            [100, 200],
            [200, 200],
            [300, 200],
            [400, 200],
            [500, 200],
            [600, 200],
          ],
          color: '#3b82f6',
        },
      ]),
      buildCanvasPage('mp2', 1, [
        {
          points: [
            [400, 100],
            [400, 200],
            [400, 300],
            [400, 400],
            [400, 500],
            [400, 600],
          ],
          color: '#10b981',
        },
      ]),
    ],
  },
};

const FIXTURE_RTL: FixtureDocument = {
  id: '90000000-0000-0000-0000-000000000003',
  title: 'RTL — Hebrew with Math',
  canvas_type: 'blank',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null, dir: 'rtl' },
        content: [{ type: 'text', text: 'נוסחאות' }],
      },
      {
        type: 'paragraph',
        attrs: { dir: 'rtl' },
        content: [
          { type: 'text', text: 'משפט פיתגורס: ' },
          {
            type: 'mathExpression',
            attrs: { latex: 'a^2 + b^2 = c^2', originalText: ':{a^2+b^2=c^2}' },
          },
          { type: 'text', text: ' חל על כל משולש ישר זווית.' },
        ],
      },
      {
        type: 'paragraph',
        attrs: { dir: 'ltr' },
        content: [
          { type: 'text', text: 'Mixed: ' },
          { type: 'text', text: 'שלום עולם' },
          { type: 'text', text: ' is "hello world" in Hebrew.' },
        ],
      },
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

async function exportAndScreenshot(
  page: Page,
  context: BrowserContext,
  doc: FixtureDocument,
  snapshot: string,
) {
  await upsertFixtureDocument(doc);
  await page.goto(`/dashboard/documents/${doc.id}`);
  await page
    .locator('[aria-label="Export as PDF"], [title="Export as PDF"]')
    .first()
    .waitFor();

  const popupPromise = context.waitForEvent('page');
  await page
    .locator('[aria-label="Export as PDF"], [title="Export as PDF"]')
    .first()
    .click();
  const popup = await popupPromise;
  await settlePopup(popup, A4_VIEWPORT);
  await expect(popup).toHaveScreenshot(snapshot, { fullPage: true });
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe('PDF export — visual regression', () => {
  test.beforeEach(async ({ page, context }) => {
    await neuterPopupPrint(context);
    await login(page);
  });

  test('text basics — headings + paragraph + bullet list with bold', async ({
    page,
    context,
  }) => {
    await exportAndScreenshot(page, context, FIXTURE_BASIC, 'pdf-basic.png');
  });

  test('inline math — KaTeX expressions in paragraphs', async ({
    page,
    context,
  }) => {
    await exportAndScreenshot(page, context, FIXTURE_MATH, 'pdf-math.png');
  });

  test('rtl + math — Hebrew text with embedded LaTeX', async ({
    page,
    context,
  }) => {
    await exportAndScreenshot(page, context, FIXTURE_RTL, 'pdf-rtl-math.png');
  });

  test('math inside headings and list items', async ({ page, context }) => {
    await exportAndScreenshot(
      page,
      context,
      FIXTURE_MATH_IN_STRUCTURE,
      'pdf-math-in-structure.png',
    );
  });

  test('invalid LaTeX — error fallback rendering', async ({
    page,
    context,
  }) => {
    await exportAndScreenshot(
      page,
      context,
      FIXTURE_INVALID_LATEX,
      'pdf-invalid-latex.png',
    );
  });

  test('long text — wrapping and page-break behaviour', async ({
    page,
    context,
  }) => {
    await exportAndScreenshot(
      page,
      context,
      FIXTURE_LONG_TEXT,
      'pdf-long-text.png',
    );
  });

  test('canvas — pen strokes (X pattern)', async ({ page, context }) => {
    await exportAndScreenshot(
      page,
      context,
      FIXTURE_CANVAS_STROKES,
      'pdf-canvas-strokes.png',
    );
  });

  test('canvas — multi-page document', async ({ page, context }) => {
    await exportAndScreenshot(
      page,
      context,
      FIXTURE_CANVAS_MULTIPAGE,
      'pdf-canvas-multipage.png',
    );
  });
});
