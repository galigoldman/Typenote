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
  const [eraserPosition, setEraserPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const checkHits = useCallback(
    (pageId: string, x: number, y: number) => {
      const strokes = getPageStrokes(pageId);
      for (const stroke of strokes) {
        if (isStrokeHit(stroke, x, y, eraserRadius)) {
          onStrokeRemove(pageId, stroke.id);
        }
      }
    },
    [eraserRadius, onStrokeRemove, getPageStrokes],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'eraser') return;

      e.preventDefault();
      isErasingRef.current = true;

      const interactionLayer = e.target as HTMLElement;
      const pageContainer = interactionLayer.parentElement;
      if (!pageContainer) return;
      const rect = pageContainer.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (PAGE_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (PAGE_HEIGHT / rect.height);
      setEraserPosition({ x, y });
      checkHits(pageId, x, y);
    },
    [activeTool, checkHits],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'eraser') return;

      e.preventDefault();

      const interactionLayer = e.target as HTMLElement;
      const pageContainer = interactionLayer.parentElement;
      if (!pageContainer) return;
      const rect = pageContainer.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (PAGE_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (PAGE_HEIGHT / rect.height);
      setEraserPosition({ x, y });

      if (!isErasingRef.current) return;

      checkHits(pageId, x, y);
    },
    [activeTool, checkHits],
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
