/**
 * Preprocess a TipTap JSON document to preserve empty paragraphs in HTML output.
 *
 * TipTap's `generateHTML()` strips empty paragraph nodes (`{type: 'paragraph'}` or
 * `{type: 'paragraph', content: []}`) during HTML serialization, which causes blank
 * lines typed by users to disappear from PDF exports. This function walks the
 * document tree and replaces every empty paragraph with a paragraph containing a
 * non-breaking space (`\u00a0`), which survives serialization and renders as a
 * full line of vertical space in the browser.
 *
 * Pure function — does not mutate the input.
 *
 * Issue: https://github.com/galigoldman/Typenote/issues/115
 */

const NBSP = '\u00a0';

export function preserveEmptyParagraphs(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;

  const n = node as Record<string, unknown>;

  // Empty paragraph: replace with one containing a non-breaking space.
  // Preserves attrs (e.g. textAlign) but drops the empty content array.
  if (n.type === 'paragraph') {
    const content = n.content as unknown[] | undefined;
    if (!Array.isArray(content) || content.length === 0) {
      const rest: Record<string, unknown> = { ...n };
      delete rest.content;
      return { ...rest, content: [{ type: 'text', text: NBSP }] };
    }
  }

  // Recurse into children of any node that has a content array.
  if (Array.isArray(n.content)) {
    return { ...n, content: n.content.map(preserveEmptyParagraphs) };
  }

  return n;
}
