import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { detectDirection } from './direction';

const LIST_TYPES = new Set([
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
]);

/**
 * Walk a document tree, detect direction on textblock nodes,
 * and propagate `dir` up to parent list/listItem nodes.
 */
function applyDirections(doc: PmNode, tr: Transaction): boolean {
  let modified = false;

  doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent.length > 0) {
      const dir = detectDirection(node.textContent);
      if (node.attrs.dir !== dir) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, dir });
        modified = true;
      }

      // Propagate dir to parent list nodes so bullets/numbers/checkboxes
      // render on the correct side for RTL languages.
      const $pos = tr.doc.resolve(pos);
      for (let d = $pos.depth - 1; d >= 0; d--) {
        const ancestor = $pos.node(d);
        if (LIST_TYPES.has(ancestor.type.name) && ancestor.attrs.dir !== dir) {
          tr.setNodeMarkup($pos.before(d), undefined, {
            ...ancestor.attrs,
            dir,
          });
          modified = true;
        }
      }
    }
  });

  return modified;
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
          'taskList',
          'listItem',
          'taskItem',
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

  onCreate({ editor }) {
    const { state } = editor;
    const { tr } = state;
    if (applyDirections(state.doc, tr)) {
      editor.view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoDirection'),
        appendTransaction: (_, __, newState) => {
          const { tr } = newState;
          return applyDirections(newState.doc, tr) ? tr : null;
        },
      }),
    ];
  },
});
