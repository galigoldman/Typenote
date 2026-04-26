import { describe, it, expect } from 'vitest';
import { pageHasContent, stripTrailingEmptyPages } from '../page-utils';
import type { CanvasPage } from '@/types/canvas';

function makePage(overrides: Partial<CanvasPage> = {}): CanvasPage {
  return {
    id: 'p1',
    order: 0,
    strokes: [],
    textBoxes: [],
    flowContent: null,
    ...overrides,
  };
}

function makeTextBox(content: Record<string, unknown> | null = null) {
  return {
    id: 'tb1',
    x: 40,
    y: 40,
    width: 714,
    height: 60,
    content,
    isFullPage: false,
    zIndex: 0,
  };
}

function makeStroke() {
  return {
    id: 's1',
    points: [[100, 100, 0.5] as [number, number, number]],
    color: '#000',
    width: 2,
    opacity: 1,
    bbox: { minX: 100, minY: 100, maxX: 100, maxY: 100 },
    createdAt: Date.now(),
  };
}

// ─── pageHasContent() ────────────────────────────────────────

describe('pageHasContent', () => {
  it('returns true for page with strokes', () => {
    expect(pageHasContent(makePage({ strokes: [makeStroke()] }))).toBe(true);
  });

  it('returns true for page with textBoxes containing content', () => {
    const page = makePage({
      textBoxes: [
        makeTextBox({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
          ],
        }),
      ],
    });
    expect(pageHasContent(page)).toBe(true);
  });

  it('returns true for page with empty textBox (created but never typed in)', () => {
    const page = makePage({ textBoxes: [makeTextBox(null)] });
    expect(pageHasContent(page)).toBe(true);
  });

  it('returns true for page with pdfPage field', () => {
    const page = makePage({ pdfPage: 0 });
    expect(pageHasContent(page)).toBe(true);
  });

  it('returns true for page with flowContent containing text', () => {
    const page = makePage({
      flowContent: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        ],
      },
    });
    expect(pageHasContent(page)).toBe(true);
  });

  it('returns false for truly blank page', () => {
    expect(pageHasContent(makePage())).toBe(false);
  });

  it('returns false for page with empty flowContent (no text)', () => {
    const page = makePage({
      flowContent: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(pageHasContent(page)).toBe(false);
  });

  it('returns true for -ftb text box with only math content', () => {
    const page = makePage({
      textBoxes: [
        {
          ...makeTextBox({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'mathExpression',
                    attrs: { latex: 'x^2 + y^2 = z^2' },
                  },
                ],
              },
            ],
          }),
          id: 'p1-ftb',
        },
      ],
    });
    expect(pageHasContent(page)).toBe(true);
  });

  it('returns true for flowContent with only math content', () => {
    const page = makePage({
      flowContent: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'mathExpression',
                attrs: { latex: '\\int_0^1 f(x) dx' },
              },
            ],
          },
        ],
      },
    });
    expect(pageHasContent(page)).toBe(true);
  });
});

// ─── stripTrailingEmptyPages() ───────────────────────────────

describe('stripTrailingEmptyPages', () => {
  it('does not strip trailing pages that have textBoxes', () => {
    const pages = [
      makePage({ order: 0, strokes: [makeStroke()] }),
      makePage({ order: 1 }),
      makePage({ order: 2, textBoxes: [makeTextBox(null)] }),
    ];
    const result = stripTrailingEmptyPages(pages, 0);
    expect(result).toHaveLength(3);
  });

  it('does not strip trailing pages with pdfPage field', () => {
    const pages = [
      makePage({ order: 0, strokes: [makeStroke()] }),
      makePage({ order: 1, pdfPage: 1 }),
      makePage({ order: 2, pdfPage: 2 }),
    ];
    const result = stripTrailingEmptyPages(pages, 0);
    expect(result).toHaveLength(3);
  });

  it('never strips below database page count floor', () => {
    const pages = [
      makePage({ order: 0, strokes: [makeStroke()] }),
      makePage({ order: 1 }),
      makePage({ order: 2 }),
      makePage({ order: 3 }),
      makePage({ order: 4 }),
    ];
    // Floor is 5 — database knows about all 5 pages
    const result = stripTrailingEmptyPages(pages, 5);
    expect(result).toHaveLength(5);
  });

  it('strips truly blank trailing pages above the floor', () => {
    const pages = [
      makePage({ order: 0, strokes: [makeStroke()] }),
      makePage({ order: 1 }),
      makePage({ order: 2 }),
    ];
    // Floor is 1 — only page 0 was in the database
    const result = stripTrailingEmptyPages(pages, 1);
    expect(result).toHaveLength(1);
  });

  it('always preserves at least page 0', () => {
    const pages = [makePage({ order: 0 })];
    const result = stripTrailingEmptyPages(pages, 0);
    expect(result).toHaveLength(1);
  });

  it('preserves trailing math-only pages', () => {
    const pages = [
      makePage({ order: 0, strokes: [makeStroke()] }),
      makePage({
        order: 1,
        flowContent: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'mathExpression',
                  attrs: { latex: 'E = mc^2' },
                },
              ],
            },
          ],
        },
      }),
      makePage({ order: 2 }), // trailing empty
    ];
    // Floor is 1. The math page should NOT be stripped.
    const result = stripTrailingEmptyPages(pages, 1);
    expect(result).toHaveLength(2); // page 0 (strokes) + page 1 (math)
  });

  it('preserves intermediate blank pages when later pages have content', () => {
    const pages = [
      makePage({ order: 0, strokes: [makeStroke()] }),
      makePage({ order: 1 }),
      makePage({ order: 2, textBoxes: [makeTextBox(null)] }),
    ];
    const result = stripTrailingEmptyPages(pages, 0);
    expect(result).toHaveLength(3);
  });
});
