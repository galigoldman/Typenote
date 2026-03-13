import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  renderTiptapContent,
  measureNodeHeight,
  PX_TO_PT,
} from '../tiptap-to-pdf';

// ---------------------------------------------------------------------------
// Mock jsPDF document factory
// ---------------------------------------------------------------------------

function makeMockDoc() {
  return {
    text: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    link: vi.fn(),
    splitTextToSize: vi.fn((text: string) => (text ? [text] : [''])),
    getTextDimensions: vi.fn(() => ({ w: 50, h: 12 })),
    getLineHeight: vi.fn(() => 16.8),
  };
}

// ---------------------------------------------------------------------------
// TipTap node builder helpers
// ---------------------------------------------------------------------------

function makeDoc(content: Record<string, unknown>[]) {
  return { type: 'doc', content };
}

function makeHeading(level: number, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function makeParagraph(text: string) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function makeBulletList(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    })),
  };
}

function makeOrderedList(items: string[], start = 1) {
  return {
    type: 'orderedList',
    attrs: { start },
    content: items.map((text) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    })),
  };
}

function makeTaskList(items: { text: string; checked: boolean }[]) {
  return {
    type: 'taskList',
    content: items.map((item) => ({
      type: 'taskItem',
      attrs: { checked: item.checked },
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: item.text }],
        },
      ],
    })),
  };
}

function makeCodeBlock(text: string) {
  return {
    type: 'codeBlock',
    content: [{ type: 'text', text }],
  };
}

function makeTextWithMark(
  text: string,
  markType: string,
  attrs?: Record<string, unknown>,
) {
  return {
    type: 'text',
    text,
    marks: [{ type: markType, ...(attrs ? { attrs } : {}) }],
  };
}

// ---------------------------------------------------------------------------
// renderTiptapContent
// ---------------------------------------------------------------------------

describe('renderTiptapContent', () => {
  let doc: ReturnType<typeof makeMockDoc>;

  beforeEach(() => {
    doc = makeMockDoc();
    vi.clearAllMocks();
  });

  it('should render heading with bold font and correct size', () => {
    const content = makeDoc([makeHeading(1, 'Hello World')]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'bold');
    // H1 = 36px (prose-base 2.25em) at default scale=1
    expect(doc.setFontSize).toHaveBeenCalledWith(36);
  });

  it('should render heading level 2 at 24px', () => {
    const content = makeDoc([makeHeading(2, 'Sub Heading')]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    // H2 = 24px (prose-base 1.5em)
    expect(doc.setFontSize).toHaveBeenCalledWith(24);
  });

  it('should render heading level 3 at 20px', () => {
    const content = makeDoc([makeHeading(3, 'Small Heading')]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    // H3 = 20px (prose-base 1.25em)
    expect(doc.setFontSize).toHaveBeenCalledWith(20);
  });

  it('should render paragraph at 16px normal', () => {
    const content = makeDoc([makeParagraph('A simple paragraph.')]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    // Paragraph = 16px (prose-base 1rem) at default scale=1
    expect(doc.setFontSize).toHaveBeenCalledWith(16);
    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'normal');
  });

  it('should use PX_TO_PT scale for text-only A4 rendering', () => {
    const content = makeDoc([makeParagraph('A4 text.')]);

    renderTiptapContent(doc as never, content, 72, 72, 451, PX_TO_PT);

    // 16 * 0.75 = 12pt for A4
    expect(doc.setFontSize).toHaveBeenCalledWith(12);
  });

  it('should render bullet list items with bullet character', () => {
    const content = makeDoc([makeBulletList(['Item one', 'Item two'])]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    // The bullet character U+2022 should appear via doc.text
    const textCalls = doc.text.mock.calls.map((c) => c[0]);
    expect(textCalls).toContain('\u2022');
  });

  it('should render ordered list items with numbers', () => {
    const content = makeDoc([makeOrderedList(['First', 'Second'])]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    const textCalls = doc.text.mock.calls.map((c) => c[0]);
    expect(textCalls).toContain('1.');
    expect(textCalls).toContain('2.');
  });

  it('should render task list with checkbox characters', () => {
    const content = makeDoc([
      makeTaskList([
        { text: 'Unchecked task', checked: false },
        { text: 'Checked task', checked: true },
      ]),
    ]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    const textCalls = doc.text.mock.calls.map((c) => c[0]);
    // ☐ (U+2610) for unchecked, ☑ (U+2611) for checked
    expect(textCalls).toContain('\u2610');
    expect(textCalls).toContain('\u2611');
  });

  it('should render code block with GeistMono font', () => {
    const content = makeDoc([makeCodeBlock('const x = 1;')]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    expect(doc.setFont).toHaveBeenCalledWith('GeistMono', 'normal');
  });

  it('should handle bold mark', () => {
    const content = makeDoc([
      {
        type: 'paragraph',
        content: [makeTextWithMark('Bold text', 'bold')],
      },
    ]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'bold');
  });

  it('should handle italic mark', () => {
    const content = makeDoc([
      {
        type: 'paragraph',
        content: [makeTextWithMark('Italic text', 'italic')],
      },
    ]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'italic');
  });

  it('should handle link mark with blue color', () => {
    const content = makeDoc([
      {
        type: 'paragraph',
        content: [
          makeTextWithMark('Click here', 'link', {
            href: 'https://example.com',
          }),
        ],
      },
    ]);

    renderTiptapContent(doc as never, content, 20, 40, 500);

    // #2563eb -> r=37, g=99, b=235
    expect(doc.setTextColor).toHaveBeenCalledWith(37, 99, 235);
  });

  it('should return updated y position after rendering', () => {
    const content = makeDoc([makeParagraph('Some text')]);

    const startY = 40;
    const resultY = renderTiptapContent(doc as never, content, 20, startY, 500);

    expect(resultY).toBeGreaterThan(startY);
  });
});

// ---------------------------------------------------------------------------
// measureNodeHeight
// ---------------------------------------------------------------------------

describe('measureNodeHeight', () => {
  let doc: ReturnType<typeof makeMockDoc>;

  beforeEach(() => {
    doc = makeMockDoc();
    vi.clearAllMocks();
  });

  it('should return correct height for paragraph (default scale)', () => {
    const node = makeParagraph('Hello world');

    // splitTextToSize returns a single line by default
    doc.splitTextToSize.mockReturnValue(['Hello world']);

    const height = measureNodeHeight(doc as never, node, 500);

    // Default scale=1: font 16px, lineHeight 16*1.75=28, spacing 20 → total 48
    const lineHeight = 16 * 1.75;
    const expected = lineHeight + 20;
    expect(height).toBeCloseTo(expected, 1);
  });

  it('should return correct height for paragraph (PX_TO_PT scale)', () => {
    const node = makeParagraph('Hello world');

    doc.splitTextToSize.mockReturnValue(['Hello world']);

    const height = measureNodeHeight(doc as never, node, 451, PX_TO_PT);

    // PX_TO_PT scale: font 12pt, lineHeight 12*1.75=21, spacing 15 → total 36
    const lineHeight = 12 * 1.75;
    const expected = lineHeight + 15;
    expect(height).toBeCloseTo(expected, 1);
  });

  it('should return larger height for headings', () => {
    const paragraphNode = makeParagraph('Some text');
    const headingNode = makeHeading(1, 'Title');

    doc.splitTextToSize.mockReturnValue(['single line']);

    const paragraphHeight = measureNodeHeight(doc as never, paragraphNode, 500);
    const headingHeight = measureNodeHeight(doc as never, headingNode, 500);

    expect(headingHeight).toBeGreaterThan(paragraphHeight);
  });

  it('should return 0 for empty content', () => {
    const node = { type: 'paragraph' };
    // No content property at all — empty paragraph still returns a line height + spacing
    // But a completely unknown node with no content should return 0
    const unknownNode = { type: 'unknownNode' };

    const height = measureNodeHeight(doc as never, unknownNode, 500);

    expect(height).toBe(0);
  });
});
