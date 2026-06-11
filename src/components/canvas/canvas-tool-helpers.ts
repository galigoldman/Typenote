import type { CanvasTool } from '@/types/canvas';

/**
 * Returns true if the given tool is part of "Draw mode" — pen/highlighter/eraser.
 * Select used to be a top-level mode but is now a Draw sub-tool, so it counts too.
 *
 * Issues: #116 (Select moved into Draw mode)
 */
export function isDrawTool(tool: CanvasTool): boolean {
  return (
    tool === 'pen' ||
    tool === 'highlighter' ||
    tool === 'eraser' ||
    tool === 'select'
  );
}

/**
 * Whether undo is available for the active tool.
 *
 * Draw tools and `select` share the canvas history stack (`canUndoDraw`) —
 * selection-mode edits (delete/move/resize/paste) push to the same stack and
 * must be undoable. Text mode delegates to the TipTap editor (`canUndoText`).
 * Read/crop have no editing path, so undo is unavailable.
 */
export function canUndoForTool(
  tool: CanvasTool,
  canUndoDraw: boolean,
  canUndoText: boolean,
): boolean {
  if (tool === 'text') return canUndoText;
  if (isDrawTool(tool)) return canUndoDraw;
  return false;
}

/** Whether redo is available for the active tool. Mirrors {@link canUndoForTool}. */
export function canRedoForTool(
  tool: CanvasTool,
  canRedoDraw: boolean,
  canRedoText: boolean,
): boolean {
  if (tool === 'text') return canRedoText;
  if (isDrawTool(tool)) return canRedoDraw;
  return false;
}
