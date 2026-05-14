import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownResponse } from '../markdown-response';

describe('MarkdownResponse', () => {
  it('renders plain text without errors', () => {
    render(<MarkdownResponse content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders markdown bold and italic', () => {
    render(<MarkdownResponse content="This is **bold** and *italic* text" />);

    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');

    const italic = screen.getByText('italic');
    expect(italic.tagName).toBe('EM');
  });

  it('renders markdown lists', () => {
    const content = '- Item one\n- Item two\n- Item three';
    const { container } = render(<MarkdownResponse content={content} />);

    const list = container.querySelector('ul');
    expect(list).toBeInTheDocument();

    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe('Item one');
    expect(items[1].textContent).toBe('Item two');
    expect(items[2].textContent).toBe('Item three');
  });

  it('renders inline LaTeX ($x^2$) with katex class', () => {
    const { container } = render(
      <MarkdownResponse content="The formula is $x^2$ here" />,
    );

    const katexEl = container.querySelector('.katex');
    expect(katexEl).toBeInTheDocument();

    // Inline math should NOT have the katex-display wrapper
    const displayEl = container.querySelector('.katex-display');
    expect(displayEl).not.toBeInTheDocument();
  });

  it('renders display LaTeX ($$...$$) with katex-display class', () => {
    // remark-math v6 requires $$ delimiters on their own lines for display math
    const content = 'Before\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAfter';
    const { container } = render(<MarkdownResponse content={content} />);

    const displayEl = container.querySelector('.katex-display');
    expect(displayEl).toBeInTheDocument();
  });

  it('renders mixed content with text, math, and markdown', () => {
    const content = [
      '## Quadratic Formula',
      '',
      'The **quadratic formula** is:',
      '',
      '$$',
      'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
      '$$',
      '',
      'Where $a$, $b$, and $c$ are coefficients.',
    ].join('\n');

    const { container } = render(<MarkdownResponse content={content} />);

    // Heading rendered
    const heading = container.querySelector('h2');
    expect(heading).toBeInTheDocument();
    expect(heading!.textContent).toBe('Quadratic Formula');

    // Bold text rendered
    const bold = container.querySelector('strong');
    expect(bold).toBeInTheDocument();
    expect(bold!.textContent).toBe('quadratic formula');

    // Display math rendered
    const displayMath = container.querySelector('.katex-display');
    expect(displayMath).toBeInTheDocument();

    // Inline math rendered (a, b, c)
    const allKatex = container.querySelectorAll('.katex');
    // Display math also contains .katex, so we expect at least 4 (1 display + 3 inline)
    expect(allKatex.length).toBeGreaterThanOrEqual(4);
  });

  it('returns null for empty string content', () => {
    const { container } = render(<MarkdownResponse content="" />);
    expect(container.innerHTML).toBe('');
  });
});

/**
 * XSS-safety: unit-level guard for the same property the E2E
 * `e2e/security-prompt-injection.spec.ts` covers.
 *
 * react-markdown by default does NOT render raw HTML. The moment
 * someone adds `rehype-raw` (or any plugin that emits raw HTML), the
 * `<script>` count below jumps from 0 and this test fails — much
 * cheaper than catching the regression 30s into an E2E run.
 */
describe('MarkdownResponse — XSS safety', () => {
  it('does not emit a live <script> for inline <script> in markdown', () => {
    const { container } = render(
      <MarkdownResponse content="hello <script>window.__md_xss=true</script> world" />,
    );
    expect(container.querySelectorAll('script')).toHaveLength(0);
    // The literal characters appear as text (escaped) so a reader sees
    // what the model said.
    expect(container.textContent).toContain('<script>');
  });

  it('does not emit an <img> with an onerror sink', () => {
    const { container } = render(
      <MarkdownResponse content='<img src=x onerror="window.__md_xss=true">' />,
    );
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('onerror')).toBeNull();
    }
    expect(container.textContent).toContain('onerror');
  });

  it('sanitizes javascript: URLs in markdown links', () => {
    const { container } = render(
      <MarkdownResponse content="[click](javascript:window.__md_xss=true)" />,
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    // react-markdown's URL allowlist replaces unsafe protocols. Either
    // the protocol is stripped (href becomes empty/about:blank) or
    // replaced — what matters is that no live javascript: remains.
    expect(link!.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    expect(link!.textContent).toBe('click');
  });

  it('preserves safe https:// URLs (regression guard against over-sanitization)', () => {
    const { container } = render(
      <MarkdownResponse content="[docs](https://example.com)" />,
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://example.com');
  });
});
