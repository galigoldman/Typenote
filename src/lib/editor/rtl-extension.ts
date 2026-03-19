import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { detectDirection } from './direction';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    autoDirection: {
      setDirection: (dir: 'ltr' | 'rtl') => ReturnType;
    };
  }
}

export const AutoDirection = Extension.create({
  name: 'autoDirection',

  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'listItem',
        ],
        attributes: {
          dir: {
            default: null,
            renderHTML: (attributes) => {
              if (!attributes.dir) return {};
              return { dir: attributes.dir };
            },
          },
          // When true, auto-detect won't override this node's direction
          dirManual: {
            default: false,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setDirection:
        (dir: 'ltr' | 'rtl') =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          // Iterate over tr.doc (not state.doc) for correct positions
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (node.isTextblock) {
              if (dispatch) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  dir,
                  dirManual: true,
                });
              }
              changed = true;
            }
          });
          return changed;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoDirection'),
        appendTransaction: (transactions, _oldState, newState) => {
          // Only auto-detect when document content changed
          const docChanged = transactions.some((t) => t.docChanged);
          if (!docChanged) return null;

          const { tr } = newState;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (!node.isTextblock || node.textContent.length === 0) return;
            // Skip manually set directions
            if (node.attrs.dirManual) return;

            const dir = detectDirection(node.textContent);
            if (node.attrs.dir !== dir) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, dir });
              modified = true;
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
