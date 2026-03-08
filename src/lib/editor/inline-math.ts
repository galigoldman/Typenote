import type React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MathNodeView } from '@/components/editor/math-node-view';

// Module augmentation so editor.commands.insertMath() is type-safe
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      /**
       * Insert an empty inlineMath node at the current cursor position.
       */
      insertMath: () => ReturnType;
      /**
       * Replace an empty inlineMath node with one carrying the given attrs.
       * Also triggers a direct save via the stored saveFn.
       */
      setMathResult: (latex: string, naturalLanguage: string) => ReturnType;
    };
  }
}

export const InlineMath = Node.create({
  name: 'inlineMath',

  addStorage() {
    return {
      saveFn: null as ((content: Record<string, unknown>) => Promise<void>) | null,
    };
  },

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
      },
      naturalLanguage: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' }),
    ];
  },

  addCommands() {
    return {
      insertMath:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex: '', naturalLanguage: '' },
          });
        },
      setMathResult:
        (latex: string, naturalLanguage: string) =>
        ({ tr, state }) => {
          let mathPos = -1;
          state.doc.descendants((n, pos) => {
            if (
              n.type.name === 'inlineMath' &&
              n.attrs.latex === '' &&
              mathPos === -1
            ) {
              mathPos = pos;
            }
          });
          if (mathPos === -1) return false;

          const nodeSize = state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
          tr.replaceWith(
            mathPos,
            mathPos + nodeSize,
            state.schema.nodes.inlineMath.create({ latex, naturalLanguage }),
          );

          return true;
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      MathNodeView as unknown as React.ComponentType,
    );
  },

  addKeyboardShortcuts() {
    return {
      $: () => {
        this.editor.commands.insertMath();
        return true;
      },
    };
  },
});
