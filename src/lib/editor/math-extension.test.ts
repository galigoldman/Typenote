import { describe, it, expect, vi } from 'vitest';

// Mock the React NodeView dependencies since we're testing schema only
vi.mock('@tiptap/react', () => ({
  ReactNodeViewRenderer: vi.fn(() => () => null),
  NodeViewWrapper: vi.fn(),
}));
vi.mock('@/components/editor/math-node-view', () => ({
  MathNodeView: vi.fn(),
}));

import { MathExpression } from './math-extension';

describe('MathExpression Node', () => {
  it('should have the correct name', () => {
    expect(MathExpression.name).toBe('mathExpression');
  });

  it('should be configured as inline and atom', () => {
    const config = MathExpression.config;
    expect(config.inline).toBe(true);
    expect(config.atom).toBe(true);
    expect(config.group).toBe('inline');
    expect(config.selectable).toBe(true);
    expect(config.draggable).toBe(false);
  });

  it('should define latex attribute with empty string default', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    expect(attrs).toBeDefined();
    expect(attrs?.latex).toBeDefined();
    expect(attrs?.latex.default).toBe('');
  });

  it('should define originalText attribute with empty string default', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    expect(attrs).toBeDefined();
    expect(attrs?.originalText).toBeDefined();
    expect(attrs?.originalText.default).toBe('');
  });

  it('should parse originalText from data-original-text HTML attribute', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    const el = document.createElement('span');
    el.setAttribute('data-original-text', 'one half times five');
    expect(attrs?.originalText.parseHTML(el)).toBe('one half times five');
  });

  it('should render originalText to data-original-text HTML attribute', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    const result = attrs?.originalText.renderHTML({
      originalText: 'one half times five',
    });
    expect(result).toEqual({ 'data-original-text': 'one half times five' });
  });

  it('should parse HTML from span with data-type math-expression', () => {
    const parseRules = MathExpression.config.parseHTML?.call(MathExpression);
    expect(parseRules).toBeDefined();
    expect(parseRules).toHaveLength(1);
    expect(parseRules?.[0].tag).toBe('span[data-type="math-expression"]');
  });

  it('should render HTML with data-type and data-latex attributes', () => {
    const renderFn = MathExpression.config.renderHTML;
    expect(renderFn).toBeDefined();
    if (renderFn) {
      // HTMLAttributes passed to renderHTML are already transformed by addAttributes().renderHTML
      const result = renderFn.call(MathExpression, {
        HTMLAttributes: {
          'data-latex': '\\frac{1}{2}',
          'data-original-text': '',
        },
        node: { attrs: { latex: '\\frac{1}{2}', originalText: '' } } as unknown,
      } as Parameters<typeof renderFn>[0]);
      expect(result[0]).toBe('span');
      expect(result[1]).toHaveProperty('data-type', 'math-expression');
      expect(result[1]).toHaveProperty('data-latex', '\\frac{1}{2}');
    }
  });
});
