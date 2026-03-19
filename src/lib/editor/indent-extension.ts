import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const INDENT_STEP = 40; // px per indent level
const MAX_INDENT = 8;
const TAB_CHAR = '\t';

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const marginLeft = element.style.marginLeft;
              if (marginLeft) {
                return Math.round(parseInt(marginLeft, 10) / INDENT_STEP);
              }
              return 0;
            },
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent <= 0) return {};
              return {
                style: `margin-left: ${attributes.indent * INDENT_STEP}px`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (
              node.type.name === 'paragraph' ||
              node.type.name === 'heading'
            ) {
              const current = (node.attrs.indent as number) || 0;
              if (current < MAX_INDENT) {
                if (dispatch) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    indent: current + 1,
                  });
                }
                changed = true;
              }
            }
          });
          return changed;
        },

      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (
              node.type.name === 'paragraph' ||
              node.type.name === 'heading'
            ) {
              const current = (node.attrs.indent as number) || 0;
              if (current > 0) {
                if (dispatch) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    indent: current - 1,
                  });
                }
                changed = true;
              }
            }
          });
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { state } = this.editor;
        const { from, to } = state.selection;

        // If inside a list, nest the list item
        if (this.editor.isActive('listItem')) {
          if (this.editor.can().sinkListItem('listItem')) {
            return this.editor.commands.sinkListItem('listItem');
          }
          return false;
        }

        // If selection spans multiple lines (or full paragraph selected), indent
        const $from = state.doc.resolve(from);
        const $to = state.doc.resolve(to);
        if ($from.parent !== $to.parent || from !== to) {
          return this.editor.commands.indent();
        }

        // Collapsed cursor — insert a tab character
        return this.editor.commands.insertContent(TAB_CHAR);
      },
      'Shift-Tab': () => {
        // If inside a list, lift the list item
        if (this.editor.isActive('listItem')) {
          if (this.editor.can().liftListItem('listItem')) {
            return this.editor.commands.liftListItem('listItem');
          }
          return false;
        }

        return this.editor.commands.outdent();
      },
    };
  },
});
