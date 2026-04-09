import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { MathNodeView } from '@/components/editor/math-node-view';

export const MATH_INPUT_PLUGIN_KEY = new PluginKey('mathInput');
const MATH_WORD_PASTE_KEY = new PluginKey('mathWordPaste');

// Unicode math symbol → LaTeX command mapping
export const UNICODE_TO_LATEX: Record<string, string> = {
  '\u2229': '\\cap ',
  '\u222A': '\\cup ',
  '\u2286': '\\subseteq ',
  '\u2287': '\\supseteq ',
  '\u2208': '\\in ',
  '\u2209': '\\notin ',
  '\u2205': '\\emptyset',
  '\u00D7': '\\times ',
  '\u2260': '\\neq ',
  '\u2264': '\\leq ',
  '\u2265': '\\geq ',
  '\u221E': '\\infty',
  '\u00B1': '\\pm ',
  '\u00B7': '\\cdot ',
  '\u2211': '\\sum ',
  '\u220F': '\\prod ',
  '\u222B': '\\int ',
  '\u2192': '\\to ',
  '\u2190': '\\leftarrow ',
  '\u2194': '\\leftrightarrow ',
  '\u21D2': '\\Rightarrow ',
  '\u21D0': '\\Leftarrow ',
  '\u21D4': '\\Leftrightarrow ',
  '\u2200': '\\forall ',
  '\u2203': '\\exists ',
  '\u00AC': '\\neg ',
  '\u2227': '\\land ',
  '\u2228': '\\lor ',
  '\u2282': '\\subset ',
  '\u2283': '\\supset ',
  '\u2248': '\\approx ',
  '\u2261': '\\equiv ',
  '\u221D': '\\propto ',
  '\u2202': '\\partial ',
  '\u2207': '\\nabla ',
  '\u22C5': '\\cdot ',
  '\u2026': '\\ldots ',
  '\u22EF': '\\cdots ',
  '\u2016': '\\|',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u0305': '\\overline',
};

// Regex matching any Unicode math symbol from our map
const UNICODE_MATH_RE = new RegExp(
  `[${Object.keys(UNICODE_TO_LATEX).join('')}]`,
);

// Check if text contains Word-style math (^{}/_{} notation or Unicode math symbols)
export function hasWordMath(text: string): boolean {
  return /[\^_]\{/.test(text) && UNICODE_MATH_RE.test(text);
}

// Replace Unicode math symbols with LaTeX commands
export function unicodeToLatex(text: string): string {
  let result = text;
  for (const [unicode, latex] of Object.entries(UNICODE_TO_LATEX)) {
    result = result.replaceAll(unicode, latex);
  }
  return result;
}

// Find math segment ranges in text that contains Word-style math.
// A math segment is a contiguous region containing ^{}, _{}, or Unicode math symbols,
// expanded to include surrounding variables and operators.
export function findMathRanges(
  text: string,
): Array<{ start: number; end: number }> {
  // Find positions of math "anchors": ^{...}, _{...}, and Unicode math symbols
  const anchors: Array<{ start: number; end: number }> = [];
  const anchorRe = new RegExp(
    `[\\^_]\\{[^}]*\\}|[${Object.keys(UNICODE_TO_LATEX).join('')}]`,
    'g',
  );
  let m;
  while ((m = anchorRe.exec(text)) !== null) {
    // Expand left to include preceding word/math chars (variable names, digits)
    let start = m.index;
    while (start > 0 && /[\w.'#]/.test(text[start - 1])) start--;

    // Expand right to include following word/math chars
    let end = m.index + m[0].length;
    while (end < text.length && /[\w.'*]/.test(text[end])) end++;

    anchors.push({ start, end });
  }

  if (anchors.length === 0) return [];

  // Sort by start position
  anchors.sort((a, b) => a.start - b.start);

  // Merge anchors that are close together (separated only by spaces + operators)
  const merged: Array<{ start: number; end: number }> = [{ ...anchors[0] }];
  for (let i = 1; i < anchors.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = anchors[i];
    const gap = text.slice(prev.end, curr.start);

    // Merge if gap is only whitespace and/or operators
    if (/^[\s=+\-*/,;:<>|]*$/.test(gap) && gap.length <= 10) {
      prev.end = curr.end;
    } else {
      merged.push({ ...curr });
    }
  }

  // Expand each merged range to include trailing = or operators
  for (const range of merged) {
    const after = text.slice(range.end);
    const trailingMatch = after.match(/^[\s]*[=+\-*/]+[\s]*/);
    if (trailingMatch) {
      range.end += trailingMatch[0].length;
    }
  }

  return merged;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathExpression: {
      insertMath: (latex: string, originalText?: string) => ReturnType;
    };
  }
}

export const MathExpression = Node.create({
  name: 'mathExpression',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: true,

  draggable: false,

  renderText({ node }) {
    return node.attrs.latex as string;
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-latex') || '',
        renderHTML: (attributes: Record<string, string>) => ({
          'data-latex': attributes.latex,
        }),
      },
      originalText: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-original-text') || '',
        renderHTML: (attributes: Record<string, string>) => ({
          'data-original-text': attributes.originalText,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-expression"]',
      },
      {
        tag: 'span.katex',
        getAttrs: (element: HTMLElement) => {
          const annotation = element.querySelector(
            'annotation[encoding="application/x-tex"]',
          );
          if (!annotation?.textContent) return false;
          return { latex: annotation.textContent };
        },
      },
      {
        tag: 'math',
        getAttrs: (element: HTMLElement) => {
          const annotation = element.querySelector(
            'annotation[encoding="application/x-tex"]',
          );
          if (!annotation?.textContent) return false;
          return { latex: annotation.textContent };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-expression',
      }),
    ];
  },

  addCommands() {
    return {
      insertMath:
        (latex: string, originalText?: string) =>
        ({ tr, dispatch, state }) => {
          const node = state.schema.nodes.mathExpression.create({
            latex,
            originalText: originalText ?? '',
          });
          if (dispatch) {
            tr.replaceSelectionWith(node);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },

  addPasteRules() {
    return [
      // Inline: $...$ (not $$)
      nodePasteRule({
        find: /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
          originalText: match[0],
        }),
      }),
      // Display: $$...$$
      nodePasteRule({
        find: /\$\$([^\$]+?)\$\$/g,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
          originalText: match[0],
        }),
      }),
      // Inline: \(...\)
      nodePasteRule({
        find: /\\\((.+?)\\\)/g,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
          originalText: match[0],
        }),
      }),
      // Display: \[...\]
      nodePasteRule({
        find: /\\\[(.+?)\\\]/g,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
          originalText: match[0],
        }),
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      // Detect Word-style math in pasted plain text (Unicode symbols + ^{}/_{})
      new Plugin({
        key: MATH_WORD_PASTE_KEY,
        props: {
          handlePaste(view, event) {
            const text = event.clipboardData?.getData('text/plain');
            const html = event.clipboardData?.getData('text/html');
            // DEBUG: log clipboard contents to diagnose Word paste
            console.log(
              '[math-paste] plain:',
              JSON.stringify(text?.slice(0, 500)),
            );
            console.log(
              '[math-paste] html:',
              JSON.stringify(html?.slice(0, 500)),
            );
            console.log(
              '[math-paste] hasWordMath:',
              text ? hasWordMath(text) : 'no text',
            );
            if (!text || !hasWordMath(text)) return false;

            const { schema } = view.state;
            const mathType = schema.nodes.mathExpression;
            const paragraphs: import('@tiptap/pm/model').Node[] = [];

            const lines = text.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;

              const ranges = findMathRanges(line);
              if (ranges.length === 0) {
                // No math on this line — insert as plain text
                paragraphs.push(
                  schema.nodes.paragraph.create(null, schema.text(line)),
                );
                continue;
              }

              // Build inline nodes: text + math + text + math + ...
              const inlineNodes: import('@tiptap/pm/model').Node[] = [];
              let cursor = 0;

              for (const range of ranges) {
                // Text before this math segment
                if (range.start > cursor) {
                  const before = line.slice(cursor, range.start);
                  if (before.trim()) inlineNodes.push(schema.text(before));
                }

                // Math segment: convert Unicode to LaTeX and create math node
                const rawMath = line.slice(range.start, range.end).trim();
                const latex = unicodeToLatex(rawMath);
                inlineNodes.push(
                  mathType.create({ latex, originalText: rawMath }),
                );

                cursor = range.end;
              }

              // Text after last math segment
              if (cursor < line.length) {
                const after = line.slice(cursor);
                if (after.trim()) inlineNodes.push(schema.text(after));
              }

              if (inlineNodes.length > 0) {
                paragraphs.push(
                  schema.nodes.paragraph.create(null, inlineNodes),
                );
              }
            }

            if (paragraphs.length === 0) return false;

            // Build and insert the slice using ProseMirror's transaction API
            let tr = view.state.tr;
            const { from, to } = tr.selection;
            tr = tr.deleteRange(from, to);
            for (let i = paragraphs.length - 1; i >= 0; i--) {
              tr = tr.insert(from, paragraphs[i]);
            }
            view.dispatch(tr);
            return true;
          },
        },
      }),
      new Plugin({
        key: MATH_INPUT_PLUGIN_KEY,
        props: {
          handleKeyDown(view, event) {
            // Accept both { and } — on Hebrew/RTL keyboards, braces are
            // swapped (event.key is '}' but displays as '{' due to bidi mirroring)
            if (event.key !== '{' && event.key !== '}') return false;

            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Need at least one character before cursor in this text block
            if ($from.parentOffset < 1) return false;

            // Find ':' before cursor, skipping invisible Unicode bidi/directional
            // marks that browsers insert in RTL (e.g. Hebrew) text contexts.
            const pos = selection.from;
            const parentStart = $from.start();
            let colonPos = -1;
            for (let i = pos - 1; i >= parentStart && i >= pos - 3; i--) {
              const ch = state.doc.textBetween(i, i + 1);
              if (ch === ':') {
                colonPos = i;
                break;
              }
              const code = ch.charCodeAt(0);
              // Skip zero-width and bidi control characters
              if (
                (code >= 0x200b && code <= 0x200f) ||
                (code >= 0x2028 && code <= 0x202f) ||
                (code >= 0x2060 && code <= 0x2069) ||
                code === 0x061c ||
                code === 0xfeff
              ) {
                continue;
              }
              break; // Visible non-colon character — stop
            }
            if (colonPos === -1) return false;

            // Don't trigger inside code blocks
            if ($from.parent.type.name === 'codeBlock') return false;

            // Don't trigger if cursor has code mark
            const codeMarkType = state.schema.marks.code;
            if (codeMarkType && codeMarkType.isInSet($from.marks())) {
              return false;
            }

            // Delete from colon to cursor (removes ':' and any bidi marks)
            view.dispatch(state.tr.delete(colonPos, pos));

            // Get cursor coordinates for positioning the input box
            const coords = view.coordsAtPos(colonPos);

            // Dispatch a custom event that the React wrapper listens for
            const customEvent = new CustomEvent('math-input-trigger', {
              detail: { x: coords.left, y: coords.bottom + 4 },
            });
            window.dispatchEvent(customEvent);

            // Prevent the '{' from being inserted
            return true;
          },
        },
      }),
    ];
  },
});
