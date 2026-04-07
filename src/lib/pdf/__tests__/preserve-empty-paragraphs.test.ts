import { describe, it, expect } from 'vitest';
import { preserveEmptyParagraphs } from '../preserve-empty-paragraphs';

const NBSP = '\u00a0';
const nbspParagraph = (extra: Record<string, unknown> = {}) => ({
  type: 'paragraph',
  ...extra,
  content: [{ type: 'text', text: NBSP }],
});

describe('preserveEmptyParagraphs', () => {
  it('replaces a top-level empty paragraph with no content key', () => {
    const input = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    const result = preserveEmptyParagraphs(input);
    expect(result).toEqual({
      type: 'doc',
      content: [nbspParagraph()],
    });
  });

  it('replaces a top-level empty paragraph with empty content array', () => {
    const input = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
    const result = preserveEmptyParagraphs(input);
    expect(result).toEqual({
      type: 'doc',
      content: [nbspParagraph({ content: undefined })],
    });
  });

  it('leaves a non-empty paragraph unchanged', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    };
    const result = preserveEmptyParagraphs(input);
    expect(result).toEqual(input);
  });

  it('replaces empty paragraphs inside list items', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph' }],
            },
          ],
        },
      ],
    };
    const result = preserveEmptyParagraphs(input) as {
      content: Array<{ content: Array<{ content: Array<unknown> }> }>;
    };
    expect(result.content[0].content[0].content[0]).toEqual(nbspParagraph());
  });

  it('replaces empty paragraphs inside blockquotes', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [] }],
        },
      ],
    };
    const result = preserveEmptyParagraphs(input) as {
      content: Array<{ content: Array<unknown> }>;
    };
    expect(result.content[0].content[0]).toEqual(
      nbspParagraph({ content: undefined }),
    );
  });

  it('replaces multiple consecutive empty paragraphs', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 4' }] },
      ],
    };
    const result = preserveEmptyParagraphs(input) as {
      content: Array<unknown>;
    };
    expect(result.content).toHaveLength(5);
    expect(result.content[1]).toEqual(nbspParagraph());
    expect(result.content[2]).toEqual(nbspParagraph());
    expect(result.content[3]).toEqual(nbspParagraph());
  });

  it('preserves attrs on replaced empty paragraphs', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center', dir: 'rtl' },
        },
      ],
    };
    const result = preserveEmptyParagraphs(input) as {
      content: Array<{ attrs: Record<string, unknown>; content: unknown }>;
    };
    expect(result.content[0].attrs).toEqual({
      textAlign: 'center',
      dir: 'rtl',
    });
    expect(result.content[0].content).toEqual([{ type: 'text', text: NBSP }]);
  });

  it('handles a document made entirely of empty paragraphs', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    };
    const result = preserveEmptyParagraphs(input) as {
      content: Array<unknown>;
    };
    expect(result.content).toEqual([
      nbspParagraph(),
      nbspParagraph(),
      nbspParagraph(),
    ]);
  });

  it('does not touch heading nodes (only paragraphs)', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 } }, // empty heading should NOT get nbsp
      ],
    };
    const result = preserveEmptyParagraphs(input);
    expect(result).toEqual(input);
  });

  it('does not mutate the input', () => {
    const input = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    const inputClone = JSON.parse(JSON.stringify(input));
    preserveEmptyParagraphs(input);
    expect(input).toEqual(inputClone);
  });
});
