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
            if (event.key !== '$') return false;

            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Don't trigger inside code blocks
            if ($from.parent.type.name === 'codeBlock') return false;

            // Don't trigger if cursor has code mark
            const codeMarkType = state.schema.marks.code;
            if (codeMarkType && codeMarkType.isInSet($from.marks())) {
              return false;
            }

            // Get cursor coordinates for positioning the input box
            const coords = view.coordsAtPos(selection.from);

            // Dispatch a custom event that the React wrapper listens for
            const customEvent = new CustomEvent('math-input-trigger', {
              detail: { x: coords.left, y: coords.bottom + 4 },
            });
            window.dispatchEvent(customEvent);

            // Prevent the $ from being inserted
            return true;
          },
        },
      }),
    ];
  },
});
