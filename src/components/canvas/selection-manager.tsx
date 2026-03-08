'use client';

export { useSelectionManager } from '@/hooks/use-selection-manager';
export type { UseSelectionManagerReturn } from '@/hooks/use-selection-manager';

// ---------------------------------------------------------------------------
// LassoOverlay — renders the selection rectangle while the user drags
// ---------------------------------------------------------------------------

interface LassoOverlayProps {
  rect: { x: number; y: number; width: number; height: number } | null;
}

export function LassoOverlay({ rect }: LassoOverlayProps) {
  if (!rect) return null;

  // Normalise so the div always has positive width/height regardless of
  // which direction the user dragged.
  const left = rect.width < 0 ? rect.x + rect.width : rect.x;
  const top = rect.height < 0 ? rect.y + rect.height : rect.y;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);

  return (
    <div
      className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none"
      style={{ left, top, width, height }}
    />
  );
}
