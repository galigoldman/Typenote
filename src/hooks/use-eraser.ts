'use client';

import { useCallback, useRef, useState } from 'react';
import type { CanvasTool, Stroke } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { isStrokeHit } from '@/lib/canvas/stroke-utils';

export const DEFAULT_ERASER_RADIUS = 10;

interface UseEraserOptions {
  activeTool: CanvasTool;
  eraserRadius?: number;
  onStrokeRemove: (pageId: string, strokeId: string) => void;
  getPageStrokes: (pageId: string) => Stroke[];
}

export function useEraser({
  activeTool,
  eraserRadius = DEFAULT_ERASER_RADIUS,
  onStrokeRemove,
  getPageStrokes,
}: UseEraserOptions) {
  const isErasingRef = useRef(false);
  const [eraserPosition, setEraserPosition] = useState<{ x: number; y: number } | null>(null);

  const screenToPageCoords = (
    e: React.PointerEvent,
    target: EventTarget,
  ): { x: number; y: number } => {
    const interactionLayer = target as HTMLElement;
    const pageContainer = interactionLayer.parentElement;
    if (!pageContainer) {
      return { x: 0, y: 0 };
    }
    const rect = pageContainer.getBoundingClientRect();
    const scaleX = PAGE_WIDTH / rect.width;
    const scaleY = PAGE_HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const checkHits = (pageId: string, x: number, y: number) => {
    const strokes = getPageStrokes(pageId);
    for (const stroke of strokes) {
      if (isStrokeHit(stroke, x, y, eraserRadius)) {
        onStrokeRemove(pageId, stroke.id);
      }
    }
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'eraser') return;

      e.preventDefault();
      isErasingRef.current = true;

      const { x, y } = screenToPageCoords(e, e.target);
      setEraserPosition({ x, y });
      checkHits(pageId, x, y);
    },
    [activeTool, eraserRadius, onStrokeRemove, getPageStrokes],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'eraser') return;

      e.preventDefault();

      const { x, y } = screenToPageCoords(e, e.target);
      setEraserPosition({ x, y });

      if (!isErasingRef.current) return;

      checkHits(pageId, x, y);
    },
    [activeTool, eraserRadius, onStrokeRemove, getPageStrokes],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, _pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'eraser') return;

      e.preventDefault();
      isErasingRef.current = false;
      setEraserPosition(null);
    },
    [activeTool],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    eraserPosition,
  };
}
