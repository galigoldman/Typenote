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
    };
  }
}

export const InlineMath = Node.create({
  name: 'inlineMath',

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
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView as any);
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
