import { Extension } from '@tiptap/core';

/**
 * A lightweight Tiptap extension that stores the current drawing mode state.
 *
 * The `DrawingBlockView` component reads `editor.storage.drawingMode.active`
 * to decide whether its canvas is editable.  By managing this flag through
 * a proper extension (rather than mutating `editor.storage` directly) we
 * satisfy the React hooks immutability lint rule and keep the data flow
 * explicit.
 */
export const DrawingModeExtension = Extension.create({
  name: 'drawingMode',

  addStorage() {
    return {
      active: false,
    };
  },
});
