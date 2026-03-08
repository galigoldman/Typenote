import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { v4 as uuidv4 } from 'uuid';
import type { ComponentType } from 'react';

/**
 * Augment Tiptap's Commands interface so that `editor.commands.insertDrawingBlock()`
 * is fully typed throughout the application.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawingBlock: {
      /**
       * Insert a new drawing block into the document.
       *
       * @param attrs – optional overrides for width, height, and background.
       */
      insertDrawingBlock: (
        attrs?: Partial<{
          width: number;
          height: number;
          background: string;
        }>,
      ) => ReturnType;
    };
  }
}

export interface DrawingBlockAttrs {
  id: string | null;
  width: number;
  height: number;
  background: string;
  strokes: unknown[];
}

/**
 * Creates a Tiptap Node extension for inline drawing/canvas blocks.
 *
 * The view component is injected via the factory parameter so that:
 *  1. There are no circular dependency issues between the extension and the
 *     React component (the component needs access to Tiptap types, while this
 *     extension needs the component for rendering).
 *  2. We avoid `require()` calls that break in Next.js server-side contexts.
 *  3. The consumer (tiptap-editor.tsx) has explicit control over which component
 *     is used, making testing and storybook usage straightforward.
 *
 * @param DrawingBlockView – A React component that will be rendered inside the
 *   NodeView wrapper. It receives the standard Tiptap `NodeViewProps`.
 */
export function createDrawingBlockExtension(
  DrawingBlockView: ComponentType<ReactNodeViewProps>,
) {
  return Node.create({
    name: 'drawingBlock',

    /**
     * Belongs to the "block" group so it sits at the same level as paragraphs
     * and headings in the document tree.
     */
    group: 'block',

    /**
     * `atom: true` means ProseMirror treats this node as a single opaque unit –
     * the cursor cannot be placed inside it, and it is selected/deleted as a
     * whole. This is the correct model for a drawing canvas: the internal state
     * (strokes) is managed by our React component, not by ProseMirror.
     */
    atom: true,

    /** The node can be selected (e.g. with click or arrow keys). */
    selectable: true,

    /**
     * Draggable is disabled so that accidental drag gestures (especially on
     * iPad with a pen) don't rip the block out of the document. Reordering
     * should be handled through explicit UI controls instead.
     */
    draggable: false,

    addAttributes() {
      return {
        /**
         * Unique identifier for each drawing block. Persisted in the document
         * JSON so that strokes can be associated with their block across saves.
         */
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-id'),
          renderHTML: (attributes: DrawingBlockAttrs) => ({
            'data-id': attributes.id,
          }),
        },

        /** Canvas width in CSS pixels. */
        width: {
          default: 800,
        },

        /** Canvas height in CSS pixels. */
        height: {
          default: 400,
        },

        /** CSS background value for the canvas (e.g. 'transparent', '#fff'). */
        background: {
          default: 'transparent',
        },

        /**
         * Serialised stroke data. Stored as a JSON array directly in the Tiptap
         * document so that drawings survive save/load round-trips without
         * needing a separate storage mechanism.
         *
         * The default is an empty array; each stroke object will be defined by
         * the drawing engine (pen-engine.ts) that populates this attribute.
         */
        strokes: {
          default: [],
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-type="drawing-block"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes({ 'data-type': 'drawing-block' }, HTMLAttributes),
      ];
    },

    addCommands() {
      return {
        insertDrawingBlock:
          (attrs = {}) =>
          ({ commands }) => {
            return commands.insertContent({
              type: this.name,
              attrs: {
                id: uuidv4(),
                ...attrs,
              },
            });
          },
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer(DrawingBlockView);
    },
  });
}
