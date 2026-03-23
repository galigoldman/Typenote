import { describe, it, expect } from 'vitest';
import { buildTextDocumentHtml } from '../html-template';

// Helper: simple TipTap JSON doc with a paragraph
function makeDoc(...nodes: Record<string, unknown>[]) {
  return { type: 'doc', content: nodes };
}

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function heading(text: string, level: number) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function mathNode(latex: string) {
  return {
    type: 'mathExpression',
    attrs: { latex, originalText: `$${latex}$` },
  };
}

function paragraphWithMath(textBefore: string, latex: string) {
  return {
    type: 'paragraph',
    content: [
      { type: 'text', text: textBefore },
      mathNode(latex),
    ],
  };
}

describe('buildTextDocumentHtml', () => {
  it('produces valid HTML with head and body', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Test Doc',
    );
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body');
    expect(html).toContain('</html>');
  });

  it('includes @font-face for GeistSans, GeistMono, and Noto Sans Hebrew', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Test Doc',
    );
    expect(html).toContain("font-family: 'GeistSans'");
    expect(html).toContain("font-family: 'GeistMono'");
    expect(html).toContain("font-family: 'Noto Sans Hebrew'");
    expect(html).toContain('GeistSans-Regular.ttf');
    expect(html).toContain('GeistSans-Bold.ttf');
    expect(html).toContain('GeistSans-Italic.ttf');
    expect(html).toContain('GeistMono-Regular.ttf');
    expect(html).toContain('NotoSansHebrew-Regular.ttf');
    expect(html).toContain('NotoSansHebrew-Bold.ttf');
  });

  it('includes KaTeX CSS link', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Test Doc',
    );
    expect(html).toContain('katex');
    expect(html).toContain('.css');
  });

  it('includes A4 page size print rule', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Test Doc',
    );
    expect(html).toContain('@page');
    expect(html).toContain('A4');
  });

  it('includes break-after: avoid on headings', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Test Doc',
    );
    expect(html).toContain('break-after: avoid');
  });

  it('includes dir="auto" on body for BiDi support', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Test Doc',
    );
    expect(html).toContain('dir="auto"');
  });

  it('sets the document title', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'My Notes',
    );
    expect(html).toContain('<title>My Notes</title>');
  });

  it('escapes HTML in title', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello')),
      'Notes <script>alert("xss")</script>',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders paragraph text', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('Hello world')),
      'Test',
    );
    expect(html).toContain('Hello world');
    expect(html).toContain('<p');
  });

  it('renders headings with correct tags', () => {
    const html = buildTextDocumentHtml(
      makeDoc(heading('Title', 1), heading('Subtitle', 2)),
      'Test',
    );
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
    expect(html).toContain('<h2');
    expect(html).toContain('Subtitle');
  });

  it('renders math expressions as KaTeX HTML (not raw LaTeX)', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraphWithMath('Consider ', '\\frac{a}{b}')),
      'Math Test',
    );
    // Should contain KaTeX's rendered output classes
    expect(html).toContain('katex');
    expect(html).toContain('katex-html');
    // Should contain actual rendered math structure (fraction)
    expect(html).toContain('mfrac');
    // The data-latex attribute should have been removed by post-processing
    expect(html).not.toContain('data-latex');
  });

  it('renders invalid LaTeX with error styling (not empty)', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraphWithMath('Invalid: ', '\\invalidcommand{')),
      'Math Error Test',
    );
    // KaTeX with throwOnError: false renders error in a colored span
    // It should not be empty
    expect(html).toContain('katex');
    // The content area should not be empty
    const bodyMatch = html.match(/<div class="content">([\s\S]*?)<\/div>/);
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![1].trim().length).toBeGreaterThan(0);
  });

  it('produces valid HTML for empty document', () => {
    const html = buildTextDocumentHtml(
      { type: 'doc', content: [] },
      'Empty',
    );
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<body');
  });

  it('includes Noto Sans Hebrew in font-family fallback', () => {
    const html = buildTextDocumentHtml(
      makeDoc(paragraph('שלום')),
      'Hebrew Test',
    );
    expect(html).toContain("'Noto Sans Hebrew'");
  });
});
