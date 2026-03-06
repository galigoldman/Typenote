import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { detectDirection } from './direction';

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
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoDirection'),
        appendTransaction: (_, __, newState) => {
          const { tr } = newState;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.isTextblock && node.textContent.length > 0) {
              const dir = detectDirection(node.textContent);
              if (node.attrs.dir !== dir) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, dir });
                modified = true;
              }
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
