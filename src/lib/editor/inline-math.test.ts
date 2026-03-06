import { describe, it, expect } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from './inline-math';

// Mock ReactNodeViewRenderer since we're only testing schema
vi.mock('@tiptap/react', () => ({
  ReactNodeViewRenderer: vi.fn(() => () => null),
}));

vi.mock('@/components/editor/math-node-view', () => ({
  MathNodeView: () => null,
}));

const extensions = [StarterKit, InlineMath];

describe('InlineMath Node', () => {
  it('serializes to HTML with data-type attribute', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineMath',
              attrs: { latex: 'x^2', naturalLanguage: 'x squared' },
            },
          ],
        },
      ],
    };

    const html = generateHTML(doc, extensions);
    expect(html).toContain('data-type="inline-math"');
    expect(html).toContain('<span');
  });

  it('parses HTML with data-type attribute back to JSON', () => {
    const html = '<p><span data-type="inline-math"></span></p>';
    const json = generateJSON(html, extensions);

    expect(json.content[0].content[0].type).toBe('inlineMath');
  });

  it('preserves latex and naturalLanguage attributes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineMath',
              attrs: { latex: '\\frac{1}{2}', naturalLanguage: 'one half' },
            },
          ],
        },
      ],
    };

    const html = generateHTML(doc, extensions);
    expect(html).toContain('data-type="inline-math"');
  });

  it('defaults attributes to empty strings', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineMath',
            },
          ],
        },
      ],
    };

    // Should not throw with missing attrs
    const html = generateHTML(doc, extensions);
    expect(html).toContain('data-type="inline-math"');
  });
});
