'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawingCanvas } from '@/components/drawing/drawing-canvas';
import type { Stroke, DrawingBackground } from '@/lib/drawing/types';

/**
 * React NodeView for the `drawingBlock` Tiptap extension.
 *
 * This component bridges the Tiptap/ProseMirror world with our DrawingCanvas
 * component. Tiptap supplies the node attributes (strokes, dimensions,
 * background) via `node.attrs`, and any changes are persisted back into the
 * ProseMirror document via `updateAttributes` — which automatically feeds into
 * the auto-save → Supabase → Realtime pipeline.
 */
export function DrawingBlockView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}: NodeViewProps) {
  const { width, height, background, strokes } = node.attrs as {
    width: number;
    height: number;
    background: DrawingBackground;
    strokes: Stroke[];
  };

  // Determine editability based on the parent editor's editable state
  // and whether we're in draw mode (stored in editor storage)
  const editorEditable = editor.isEditable;
  const drawMode = editor.storage.drawingMode?.active === true;
  const editable = editorEditable && drawMode;

  const handleStrokesChange = (newStrokes: Stroke[]) => {
    updateAttributes({ strokes: newStrokes });
  };

  return (
    <NodeViewWrapper className="relative my-4" data-type="drawing-block">
      {/* Delete button visible when the node is selected */}
      {selected && editorEditable && (
        <Button
          type="button"
          variant="destructive"
          size="icon-xs"
          className="absolute -top-2 -right-2 z-10"
          aria-label="Delete drawing block"
          onClick={deleteNode}
        >
          <X />
        </Button>
      )}
      <DrawingCanvas
        strokes={strokes}
        width={width}
        height={height}
        background={background}
        editable={editable}
        onStrokesChange={handleStrokesChange}
      />
    </NodeViewWrapper>
  );
}
