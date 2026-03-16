import { describe, expect, it } from 'vitest';

import { extractDocumentText, extractNodeText } from '../extract-document-text';

// ---------------------------------------------------------------------------
// Helper: wrap TipTap nodes in a doc root so they mirror real Supabase data
// ---------------------------------------------------------------------------

function makeDoc(content: unknown[]) {
  return { type: 'doc', content };
}

function textNode(text: string) {
  return { type: 'text', text };
}

function paragraph(...children: unknown[]) {
  return { type: 'paragraph', content: children };
}

function heading(level: number, ...children: unknown[]) {
  return { type: 'heading', attrs: { level }, content: children };
}

function mathExpression(latex: string) {
  return { type: 'mathExpression', attrs: { latex } };
}

function bulletList(...items: unknown[]) {
  return { type: 'bulletList', content: items };
}

function listItem(...children: unknown[]) {
  return { type: 'listItem', content: children };
}

function codeBlock(code: string) {
  return { type: 'codeBlock', content: [textNode(code)] };
}

// ---------------------------------------------------------------------------
// extractNodeText — unit-level tests on individual nodes
// ---------------------------------------------------------------------------

describe('extractNodeText', () => {
  it('extracts plain text from a text node', () => {
    const node = textNode('hello world');
    expect(extractNodeText(node)).toBe('hello world');
  });

  it('extracts LaTeX wrapped in $ from a math expression node', () => {
    const node = mathExpression('x^2 + y^2 = z^2');
    expect(extractNodeText(node)).toBe('$x^2 + y^2 = z^2$');
  });

  it('returns empty string for math expression with empty latex', () => {
    const node = mathExpression('');
    expect(extractNodeText(node)).toBe('');
  });

  it('returns empty string for math expression with no attrs', () => {
    const node = { type: 'mathExpression' };
    expect(extractNodeText(node)).toBe('');
  });

  it('concatenates inline children of a paragraph', () => {
    const node = paragraph(textNode('Hello '), textNode('world'));
    expect(extractNodeText(node)).toBe('Hello world');
  });

  it('joins block-level children with newlines', () => {
    const doc = makeDoc([
      paragraph(textNode('Line one')),
      paragraph(textNode('Line two')),
    ]);
    expect(extractNodeText(doc as never)).toBe('Line one\nLine two');
  });

  it('returns empty string for node with no content', () => {
    const node = { type: 'paragraph' };
    expect(extractNodeText(node)).toBe('');
  });

  it('returns empty string for node with empty content array', () => {
    const node = { type: 'paragraph', content: [] };
    expect(extractNodeText(node)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractDocumentText — empty / null / undefined handling
// ---------------------------------------------------------------------------

describe('extractDocumentText — empty documents', () => {
  it('returns empty string for null-ish input', () => {
    // @ts-expect-error intentionally passing null
    expect(extractDocumentText(null)).toBe('');
    // @ts-expect-error intentionally passing undefined
    expect(extractDocumentText(undefined)).toBe('');
  });

  it('returns empty string when content and pages are missing', () => {
    expect(extractDocumentText({})).toBe('');
  });

  it('returns empty string for content with no doc content array', () => {
    expect(
      extractDocumentText({ content: {} as Record<string, unknown> }),
    ).toBe('');
  });

  it('returns empty string for empty pages array', () => {
    expect(extractDocumentText({ pages: [] })).toBe('');
  });

  it('returns empty string for pages with null flowContent', () => {
    expect(
      extractDocumentText({
        pages: [
          { id: '1', order: 0, strokes: [], textBoxes: [], flowContent: null },
        ],
      }),
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractDocumentText — text-only documents
// ---------------------------------------------------------------------------

describe('extractDocumentText — text-only documents', () => {
  it('extracts text from paragraphs', () => {
    const doc = makeDoc([
      paragraph(textNode('First paragraph.')),
      paragraph(textNode('Second paragraph.')),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toBe('First paragraph.\nSecond paragraph.');
  });

  it('extracts text from headings', () => {
    const doc = makeDoc([
      heading(1, textNode('Main Title')),
      paragraph(textNode('Body text.')),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toBe('Main Title\nBody text.');
  });

  it('extracts text from bullet lists', () => {
    const doc = makeDoc([
      bulletList(
        listItem(paragraph(textNode('Item one'))),
        listItem(paragraph(textNode('Item two'))),
      ),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toContain('Item one');
    expect(result).toContain('Item two');
  });

  it('extracts text from code blocks', () => {
    const doc = makeDoc([codeBlock('const x = 42;')]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toBe('const x = 42;');
  });
});

// ---------------------------------------------------------------------------
// extractDocumentText — documents with math nodes
// ---------------------------------------------------------------------------

describe('extractDocumentText — math nodes', () => {
  it('wraps math expression LaTeX in $...$ delimiters', () => {
    const doc = makeDoc([
      paragraph(
        textNode('The equation is '),
        mathExpression('E = mc^2'),
        textNode('.'),
      ),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toBe('The equation is $E = mc^2$.');
  });

  it('handles multiple math expressions in one paragraph', () => {
    const doc = makeDoc([
      paragraph(
        textNode('Given '),
        mathExpression('a^2 + b^2 = c^2'),
        textNode(' and '),
        mathExpression('\\sin(\\theta)'),
        textNode('.'),
      ),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toBe('Given $a^2 + b^2 = c^2$ and $\\sin(\\theta)$.');
  });

  it('handles paragraph with only a math expression', () => {
    const doc = makeDoc([paragraph(mathExpression('\\int_0^1 x\\,dx'))]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });
    expect(result).toBe('$\\int_0^1 x\\,dx$');
  });
});

// ---------------------------------------------------------------------------
// extractDocumentText — canvas documents with multiple pages
// ---------------------------------------------------------------------------

describe('extractDocumentText — canvas documents', () => {
  it('extracts flowContent from multiple pages', () => {
    const page1FlowContent = makeDoc([
      paragraph(textNode('Page one content.')),
    ]);
    const page2FlowContent = makeDoc([
      paragraph(textNode('Page two content.')),
    ]);

    const result = extractDocumentText({
      pages: [
        {
          id: 'p1',
          order: 0,
          strokes: [],
          textBoxes: [],
          flowContent: page1FlowContent as Record<string, unknown>,
        },
        {
          id: 'p2',
          order: 1,
          strokes: [],
          textBoxes: [],
          flowContent: page2FlowContent as Record<string, unknown>,
        },
      ],
    });

    expect(result).toBe('Page one content.\nPage two content.');
  });

  it('skips pages with null flowContent', () => {
    const page1FlowContent = makeDoc([
      paragraph(textNode('Only page with text.')),
    ]);

    const result = extractDocumentText({
      pages: [
        {
          id: 'p1',
          order: 0,
          strokes: [],
          textBoxes: [],
          flowContent: page1FlowContent as Record<string, unknown>,
        },
        {
          id: 'p2',
          order: 1,
          strokes: [],
          textBoxes: [],
          flowContent: null,
        },
      ],
    });

    expect(result).toBe('Only page with text.');
  });

  it('handles canvas pages with math in flowContent', () => {
    const flowContent = makeDoc([
      paragraph(textNode('Solve '), mathExpression('x^2 - 4 = 0')),
    ]);

    const result = extractDocumentText({
      pages: [
        {
          id: 'p1',
          order: 0,
          strokes: [],
          textBoxes: [],
          flowContent: flowContent as Record<string, unknown>,
        },
      ],
    });

    expect(result).toBe('Solve $x^2 - 4 = 0$');
  });
});

// ---------------------------------------------------------------------------
// extractDocumentText — mixed content (text + math + empty paragraphs)
// ---------------------------------------------------------------------------

describe('extractDocumentText — mixed content', () => {
  it('handles text, math, empty paragraphs, and headings together', () => {
    const doc = makeDoc([
      heading(1, textNode('Calculus Notes')),
      paragraph(textNode('Integration basics:')),
      paragraph(), // empty paragraph
      paragraph(
        textNode('The integral '),
        mathExpression('\\int_a^b f(x)\\,dx'),
        textNode(' computes area.'),
      ),
      paragraph(textNode('Important for exams.')),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });

    // Empty paragraphs produce empty strings which are filtered out
    expect(result).toContain('Calculus Notes');
    expect(result).toContain('Integration basics:');
    expect(result).toContain('$\\int_a^b f(x)\\,dx$');
    expect(result).toContain('Important for exams.');
  });

  it('combines text document content with canvas page content', () => {
    const textContent = makeDoc([
      paragraph(textNode('Text document section.')),
    ]);
    const canvasFlowContent = makeDoc([
      paragraph(textNode('Canvas page section.')),
    ]);

    const result = extractDocumentText({
      content: textContent as Record<string, unknown>,
      pages: [
        {
          id: 'p1',
          order: 0,
          strokes: [],
          textBoxes: [],
          flowContent: canvasFlowContent as Record<string, unknown>,
        },
      ],
    });

    expect(result).toContain('Text document section.');
    expect(result).toContain('Canvas page section.');
  });

  it('handles nested lists with mixed text and math', () => {
    const doc = makeDoc([
      bulletList(
        listItem(
          paragraph(textNode('Equation: '), mathExpression('a + b = c')),
        ),
        listItem(paragraph(textNode('Plain text item'))),
      ),
    ]);

    const result = extractDocumentText({
      content: doc as Record<string, unknown>,
    });

    expect(result).toContain('Equation: $a + b = c$');
    expect(result).toContain('Plain text item');
  });
});
