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
