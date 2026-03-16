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
