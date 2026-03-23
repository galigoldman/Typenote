import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { MathNodeView } from '@/components/editor/math-node-view';

export const MATH_INPUT_PLUGIN_KEY = new PluginKey('mathInput');

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

  addProseMirrorPlugins() {
    return [
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
