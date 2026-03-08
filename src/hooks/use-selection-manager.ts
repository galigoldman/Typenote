'use client';

import { useCallback, useRef, useState } from 'react';
import type { ElementMap, Viewport } from '@/lib/canvas/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LassoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseSelectionManagerProps {
  elements: ElementMap;
  viewport: Viewport;
  onRemoveElement: (id: string) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
}

export interface UseSelectionManagerReturn {
  selectedIds: Set<string>;
  isLassoing: boolean;
  lassoRect: LassoRect | null;
  handleSelect: (id: string, shiftKey: boolean) => void;
  handleDeselect: () => void;
  handleLassoStart: (e: React.PointerEvent) => void;
  handleLassoMove: (e: React.PointerEvent) => void;
  handleLassoEnd: () => void;
  deleteSelected: () => void;
  moveSelected: (dx: number, dy: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a rectangle so width/height are always positive.
 * When the user drags upward or leftward the raw width/height will be
 * negative — this flips the origin so we get a proper bounding box.
 */
function normaliseRect(rect: LassoRect): LassoRect {
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * Convert a screen-space rectangle to canvas (world) coordinates
 * using the current viewport transform.
 *
 * Screen → World:
 *   worldX = (screenX - viewport.x) / viewport.zoom
 *   worldY = (screenY - viewport.y) / viewport.zoom
 */
function screenRectToCanvas(rect: LassoRect, viewport: Viewport): LassoRect {
  const norm = normaliseRect(rect);
  return {
    x: (norm.x - viewport.x) / viewport.zoom,
    y: (norm.y - viewport.y) / viewport.zoom,
    width: norm.width / viewport.zoom,
    height: norm.height / viewport.zoom,
  };
}

/**
 * Check whether two axis-aligned rectangles overlap.
 */
function rectsOverlap(
  a: LassoRect,
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSelectionManager({
  elements,
  viewport,
  onRemoveElement,
  onMoveElement,
}: UseSelectionManagerProps): UseSelectionManagerReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLassoing, setIsLassoing] = useState(false);
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);

  // Track the pointer origin so we can compute width/height as the user drags
  const lassoOriginRef = useRef<{ x: number; y: number } | null>(null);

  // ------- Single-element selection ----------------------------------------

  const handleSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      if (shiftKey) {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      }
      // Without shift, replace selection with just this id
      return new Set([id]);
    });
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ------- Lasso selection -------------------------------------------------

  const handleLassoStart = useCallback((e: React.PointerEvent) => {
    // Only start lasso from empty canvas (not from an element)
    const target = e.target as HTMLElement;
    if (target.closest('[data-element-id]')) return;

    lassoOriginRef.current = { x: e.clientX, y: e.clientY };
    setLassoRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
    setIsLassoing(true);
  }, []);

  const handleLassoMove = useCallback((e: React.PointerEvent) => {
    const origin = lassoOriginRef.current;
    if (!origin) return;

    setLassoRect({
      x: origin.x,
      y: origin.y,
      width: e.clientX - origin.x,
      height: e.clientY - origin.y,
    });
  }, []);

  const handleLassoEnd = useCallback(() => {
    if (!lassoRect) {
      setIsLassoing(false);
      lassoOriginRef.current = null;
      return;
    }

    // Convert the screen-space lasso rect to canvas coordinates
    const canvasRect = screenRectToCanvas(lassoRect, viewport);

    // Find all elements whose bounding box overlaps the lasso rect
    const hitIds = new Set<string>();
    for (const [id, el] of Object.entries(elements)) {
      // Skip drawing layers — only select visible, interactive elements
      if (el.type === 'drawing-layer') continue;

      if (
        rectsOverlap(canvasRect, {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        })
      ) {
        hitIds.add(id);
      }
    }

    setSelectedIds(hitIds);
    setLassoRect(null);
    setIsLassoing(false);
    lassoOriginRef.current = null;
  }, [lassoRect, viewport, elements]);

  // ------- Batch operations ------------------------------------------------

  const deleteSelected = useCallback(() => {
    for (const id of selectedIds) {
      onRemoveElement(id);
    }
    setSelectedIds(new Set());
  }, [selectedIds, onRemoveElement]);

  const moveSelected = useCallback(
    (dx: number, dy: number) => {
      for (const id of selectedIds) {
        const el = elements[id];
        if (!el) continue;
        onMoveElement(id, el.x + dx, el.y + dy);
      }
    },
    [selectedIds, elements, onMoveElement],
  );

  return {
    selectedIds,
    isLassoing,
    lassoRect,
    handleSelect,
    handleDeselect,
    handleLassoStart,
    handleLassoMove,
    handleLassoEnd,
    deleteSelected,
    moveSelected,
  };
}
