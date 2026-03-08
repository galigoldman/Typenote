'use client';

import { useCallback, useRef } from 'react';
import { getStroke } from 'perfect-freehand';
import type { CanvasTool, Stroke, StrokePoint } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { getSvgPathFromStroke, computeBBox } from '@/lib/canvas/stroke-utils';

interface UseDrawingOptions {
  activeTool: CanvasTool;
  onStrokeComplete: (pageId: string, stroke: Stroke) => void;
}

export function useDrawing({ activeTool, onStrokeComplete }: UseDrawingOptions) {
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const isDrawingRef = useRef(false);
  const activePageIdRef = useRef<string | null>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getWorkingCanvas = (pageId: string, target: EventTarget) => {
    // The interaction layer is a sibling of the working canvas.
    // Navigate: interaction layer → parent (page container) → find working canvas
    const interactionLayer = target as HTMLElement;
    const pageContainer = interactionLayer.parentElement;
    if (!pageContainer) return null;
    // Working canvas is the third child (index 2): bg, committed, working, text, interaction
    const canvases = pageContainer.querySelectorAll('canvas');
    return canvases[1] as HTMLCanvasElement | null; // second canvas = working
  };

  const getCommittedCanvas = (target: EventTarget) => {
    const interactionLayer = target as HTMLElement;
    const pageContainer = interactionLayer.parentElement;
    if (!pageContainer) return null;
    const canvases = pageContainer.querySelectorAll('canvas');
    return canvases[0] as HTMLCanvasElement | null; // first canvas = committed
  };

  const screenToPageCoords = (
    e: React.PointerEvent,
    target: EventTarget,
  ): { x: number; y: number } => {
    const interactionLayer = target as HTMLElement;
    const rect = interactionLayer.getBoundingClientRect();
    // Map screen position to page coordinates based on element size vs page size
    const scaleX = PAGE_WIDTH / rect.width;
    const scaleY = PAGE_HEIGHT / rect.height;
    return {
      x: Math.round(((e.clientX - rect.left) * scaleX) * 10) / 10,
      y: Math.round(((e.clientY - rect.top) * scaleY) * 10) / 10,
    };
  };

  const renderInProgressStroke = useCallback((canvas: HTMLCanvasElement, points: StrokePoint[]) => {
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear working canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (points.length < 2) return;

    const outlinePoints = getStroke(points, {
      size: 3,
      simulatePressure: false,
      last: false,
    });

    const pathData = getSvgPathFromStroke(outlinePoints);
    if (!pathData) return;

    const path = new Path2D(pathData);
    ctx.fillStyle = '#000000';
    ctx.fill(path);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      // T017: Stylus-only guard
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'pen') return;

      // Prevent browser text selection and default touch behavior
      e.preventDefault();

      isDrawingRef.current = true;
      activePageIdRef.current = pageId;

      const canvas = getWorkingCanvas(pageId, e.target);
      workingCanvasRef.current = canvas;

      // Capture pointer for reliable tracking
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const { x, y } = screenToPageCoords(e, e.target);
      const pressure = Math.round(e.pressure * 100) / 100;
      currentPointsRef.current = [[x, y, pressure]];
    },
    [activeTool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (!isDrawingRef.current) return;
      if (e.pointerType !== 'pen') return;
      if (activeTool !== 'pen') return;

      e.preventDefault();

      const { x, y } = screenToPageCoords(e, e.target);
      const pressure = Math.round(e.pressure * 100) / 100;
      currentPointsRef.current.push([x, y, pressure]);

      // Render in-progress stroke on working canvas
      if (workingCanvasRef.current) {
        renderInProgressStroke(workingCanvasRef.current, currentPointsRef.current);
      }
    },
    [activeTool, renderInProgressStroke],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (!isDrawingRef.current) return;
      if (e.pointerType !== 'pen') return;

      e.preventDefault();
      isDrawingRef.current = false;
      const points = currentPointsRef.current;

      if (points.length < 2) {
        currentPointsRef.current = [];
        return;
      }

      // Finalize the stroke
      const stroke: Stroke = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        points: points as StrokePoint[],
        color: '#000000',
        width: 3,
        bbox: computeBBox(points as StrokePoint[]),
        createdAt: Date.now(),
      };

      // Clear working canvas
      if (workingCanvasRef.current) {
        const ctx = workingCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, workingCanvasRef.current.width, workingCanvasRef.current.height);
          ctx.restore();
        }
      }

      // Notify parent to add stroke and trigger save
      const targetPageId = activePageIdRef.current ?? pageId;
      onStrokeComplete(targetPageId, stroke);

      currentPointsRef.current = [];
      activePageIdRef.current = null;
      workingCanvasRef.current = null;
    },
    [onStrokeComplete],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
