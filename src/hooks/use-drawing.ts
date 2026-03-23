'use client';

import { useCallback, useRef } from 'react';
import { getStroke } from 'perfect-freehand';
import type { CanvasTool, Stroke, StrokePoint } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { getSvgPathFromStroke, computeBBox } from '@/lib/canvas/stroke-utils';
import { lockScroll } from '@/lib/canvas/scroll-lock';
import type { ShapeDetectionResult } from '@/lib/canvas/shape-detection';
import {
  classifyShape,
  generateShapePoints,
  renderSnappedShape,
} from '@/lib/canvas/shape-detection';

interface UseDrawingOptions {
  activeTool: CanvasTool;
  penColor: string;
  penSize: number;
  penOpacity: number;
  onStrokeComplete: (pageId: string, stroke: Stroke) => void;
  onNearPageBottom?: (pageId: string) => void;
}

export function useDrawing({
  activeTool,
  penColor,
  penSize,
  penOpacity,
  onStrokeComplete,
  onNearPageBottom,
}: UseDrawingOptions) {
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const isDrawingRef = useRef(false);
  const activePageIdRef = useRef<string | null>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const firedNearBottomRef = useRef(false);
  const cachedRectRef = useRef<DOMRect | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);

  // Hold-to-snap: snap stroke to a shape (line, circle, rect, triangle)
  // after ~400ms of no movement
  const STRAIGHTEN_DELAY = 400;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSnappedRef = useRef(false);
  const snapStartPointRef = useRef<StrokePoint | null>(null);
  // Shape snap state: tracks the detected shape for adjustment + commit
  const snapShapeRef = useRef<ShapeDetectionResult | null>(null);

  const isDrawTool = activeTool === 'pen' || activeTool === 'highlighter';

  const getWorkingCanvas = (pageId: string, target: EventTarget) => {
    const interactionLayer = target as HTMLElement;
    const pageContainer = interactionLayer.parentElement;
    if (!pageContainer) return null;
    const canvases = pageContainer.querySelectorAll('canvas');
    return canvases[1] as HTMLCanvasElement | null; // second canvas = working
  };

  const screenToPageCoords = (
    e: React.PointerEvent,
    target: EventTarget,
  ): { x: number; y: number } => {
    const rect =
      cachedRectRef.current ?? (target as HTMLElement).getBoundingClientRect();
    const scaleX = PAGE_WIDTH / rect.width;
    const scaleY = PAGE_HEIGHT / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX * 10) / 10,
      y: Math.round((e.clientY - rect.top) * scaleY * 10) / 10,
    };
  };

  const renderStraightLine = useCallback(
    (canvas: HTMLCanvasElement, start: StrokePoint, end: StrokePoint) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Build a straight line with interpolated points for perfect-freehand
      const steps = 20;
      const linePoints: StrokePoint[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        linePoints.push([
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          (start[2] + end[2]) / 2,
        ]);
      }

      const outlinePoints = getStroke(linePoints, {
        size: penSize,
        simulatePressure: false,
        last: true,
      });

      const pathData = getSvgPathFromStroke(outlinePoints);
      if (!pathData) return;

      const path = new Path2D(pathData);
      ctx.globalAlpha = penOpacity;
      ctx.fillStyle = penColor;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    },
    [penColor, penSize, penOpacity],
  );

  const renderInProgressStroke = useCallback(
    (canvas: HTMLCanvasElement, points: StrokePoint[]) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (points.length < 2) return;

      const outlinePoints = getStroke(points, {
        size: penSize,
        simulatePressure: false,
        last: false,
      });

      const pathData = getSvgPathFromStroke(outlinePoints);
      if (!pathData) return;

      const path = new Path2D(pathData);
      ctx.globalAlpha = penOpacity;
      ctx.fillStyle = penColor;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    },
    [penColor, penSize, penOpacity],
  );

  /**
   * Re-render a snapped shape with adjusted parameters.
   * Used when the user moves the pen after a shape snap to resize it.
   */
  const renderAdjustedShape = useCallback(
    (canvas: HTMLCanvasElement, shape: ShapeDetectionResult) => {
      renderSnappedShape(canvas, shape, {
        size: penSize,
        color: penColor,
        opacity: penOpacity,
      });
    },
    [penColor, penSize, penOpacity],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (!isDrawTool) return;

      e.preventDefault();

      isDrawingRef.current = true;
      activePageIdRef.current = pageId;
      firedNearBottomRef.current = false;
      isSnappedRef.current = false;
      snapStartPointRef.current = null;
      snapShapeRef.current = null;
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      const canvas = getWorkingCanvas(pageId, e.target);
      workingCanvasRef.current = canvas;

      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // LOCK all scrolling — nothing moves while pen is down
      unlockScrollRef.current = lockScroll(e.target as HTMLElement);

      // Snapshot the interaction layer rect — reuse for the entire stroke
      cachedRectRef.current = (e.target as HTMLElement).getBoundingClientRect();

      const { x, y } = screenToPageCoords(e, e.target);
      const pressure = Math.round(e.pressure * 100) / 100;
      currentPointsRef.current = [[x, y, pressure]];
    },
    [isDrawTool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (!isDrawingRef.current) return;
      if (e.pointerType !== 'pen') return;
      if (!isDrawTool) return;

      e.preventDefault();

      const { x, y } = screenToPageCoords(e, e.target);
      const pressure = Math.round(e.pressure * 100) / 100;

      // Already snapped to a shape — adjust it
      if (isSnappedRef.current && snapShapeRef.current) {
        const shape = snapShapeRef.current;

        if (shape.type === 'circle' && shape.center) {
          // Circle: radius = distance from center to pen
          const dx = x - shape.center.x;
          const dy = y - shape.center.y;
          const newRadius = Math.sqrt(dx * dx + dy * dy);
          snapShapeRef.current = { ...shape, radius: newRadius };
        } else if (shape.type === 'rectangle' && shape.corners) {
          // Rectangle: opposite corner fixed, dragged corner follows pen
          const opposite = shape.corners[0]; // top-left stays fixed
          const newCorners = [
            opposite,
            { x, y: opposite.y },
            { x, y },
            { x: opposite.x, y },
          ];
          snapShapeRef.current = { ...shape, corners: newCorners };
        } else if (shape.type === 'triangle' && shape.corners) {
          // Triangle: uniform scale from centroid
          const cx =
            (shape.corners[0].x + shape.corners[1].x + shape.corners[2].x) / 3;
          const cy =
            (shape.corners[0].y + shape.corners[1].y + shape.corners[2].y) / 3;
          const distToPen = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          // Original max distance from centroid
          const origMaxDist = Math.max(
            ...shape.corners.map((c) =>
              Math.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2),
            ),
          );
          if (origMaxDist > 1) {
            const scale = distToPen / origMaxDist;
            const newCorners = shape.corners.map((c) => ({
              x: cx + (c.x - cx) * scale,
              y: cy + (c.y - cy) * scale,
            }));
            snapShapeRef.current = { ...shape, corners: newCorners };
          }
        }

        if (workingCanvasRef.current) {
          renderAdjustedShape(workingCanvasRef.current, snapShapeRef.current);
        }
        return;
      }

      // Already snapped to a straight line — adjust endpoint
      if (isSnappedRef.current && snapStartPointRef.current) {
        const endPoint: StrokePoint = [x, y, pressure];
        if (workingCanvasRef.current) {
          renderStraightLine(
            workingCanvasRef.current,
            snapStartPointRef.current,
            endPoint,
          );
        }
        currentPointsRef.current = [snapStartPointRef.current, endPoint];
        return;
      }

      currentPointsRef.current.push([x, y, pressure]);

      if (workingCanvasRef.current) {
        renderInProgressStroke(
          workingCanvasRef.current,
          currentPointsRef.current,
        );
      }

      // Reset hold-to-snap timer on each move
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      if (currentPointsRef.current.length >= 3) {
        holdTimerRef.current = setTimeout(() => {
          if (!isDrawingRef.current) return;

          const pts = currentPointsRef.current;

          // Try shape detection first (circle, rectangle, triangle)
          const shapeResult = classifyShape(pts);
          if (shapeResult) {
            isSnappedRef.current = true;
            snapShapeRef.current = shapeResult;
            if (workingCanvasRef.current) {
              renderSnappedShape(workingCanvasRef.current, shapeResult, {
                size: penSize,
                color: penColor,
                opacity: penOpacity,
              });
            }
            return;
          }

          // Fall through to straight line snap
          const start = pts[0];
          const end = pts[pts.length - 1];
          isSnappedRef.current = true;
          snapStartPointRef.current = start;
          currentPointsRef.current = [start, end];
          if (workingCanvasRef.current) {
            renderStraightLine(workingCanvasRef.current, start, end);
          }
        }, STRAIGHTEN_DELAY);
      }

      if (
        !firedNearBottomRef.current &&
        y > PAGE_HEIGHT * 0.85 &&
        onNearPageBottom
      ) {
        firedNearBottomRef.current = true;
        onNearPageBottom(pageId);
      }
    },
    [
      isDrawTool,
      renderInProgressStroke,
      renderStraightLine,
      renderAdjustedShape,
      penSize,
      penColor,
      penOpacity,
      onNearPageBottom,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (!isDrawingRef.current) return;
      if (e.pointerType !== 'pen') return;

      e.preventDefault();
      isDrawingRef.current = false;

      // Clear hold-to-snap timer
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      // UNLOCK scrolling — pen is up
      unlockScrollRef.current?.();
      unlockScrollRef.current = null;

      // If snapped to a shape, generate the final shape points
      if (isSnappedRef.current && snapShapeRef.current) {
        currentPointsRef.current = generateShapePoints(snapShapeRef.current);
      }
      // If snapped to a straight line, build interpolated points
      else if (isSnappedRef.current && snapStartPointRef.current) {
        const start = currentPointsRef.current[0] ?? snapStartPointRef.current;
        const end =
          currentPointsRef.current[currentPointsRef.current.length - 1] ??
          start;
        const steps = 20;
        const straightPoints: StrokePoint[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          straightPoints.push([
            start[0] + (end[0] - start[0]) * t,
            start[1] + (end[1] - start[1]) * t,
            (start[2] + end[2]) / 2,
          ]);
        }
        currentPointsRef.current = straightPoints;
      }

      isSnappedRef.current = false;
      snapStartPointRef.current = null;
      snapShapeRef.current = null;

      const points = currentPointsRef.current;

      if (points.length < 2) {
        currentPointsRef.current = [];
        return;
      }

      const stroke: Stroke = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        points: points as StrokePoint[],
        color: penColor,
        width: penSize,
        opacity: penOpacity,
        bbox: computeBBox(points as StrokePoint[]),
        createdAt: Date.now(),
      };

      if (workingCanvasRef.current) {
        const ctx = workingCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(
            0,
            0,
            workingCanvasRef.current.width,
            workingCanvasRef.current.height,
          );
          ctx.restore();
        }
      }

      const targetPageId = activePageIdRef.current ?? pageId;
      onStrokeComplete(targetPageId, stroke);

      currentPointsRef.current = [];
      activePageIdRef.current = null;
      workingCanvasRef.current = null;
      cachedRectRef.current = null;
    },
    [onStrokeComplete, penColor, penSize, penOpacity],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
