'use client';

import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { Stroke, Point } from '@/lib/drawing/types';

// ---------------------------------------------------------------------------
// Imperative handle — lets the parent drive live strokes without re-renders
// ---------------------------------------------------------------------------

export interface DrawingLayerHandle {
  /** Prepare for a new live stroke with the given style. */
  beginLiveStroke(color: string, width: number): void;
  /** Append a world-space point to the live stroke and schedule a redraw. */
  addLivePoint(worldX: number, worldY: number, pressure: number): void;
  /** Finish the live stroke, clear it, and return the accumulated points. */
  endLiveStroke(): Point[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DrawingLayerProps {
  strokes: Stroke[];
  viewport: { x: number; y: number; zoom: number };
  containerWidth: number;
  containerHeight: number;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): void {
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(
    points[0][0] * zoom + offsetX,
    points[0][1] * zoom + offsetY,
  );

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const pressure = p[2] ?? 0.5;
    ctx.lineWidth = baseWidth * pressure * zoom;
    ctx.lineTo(p[0] * zoom + offsetX, p[1] * zoom + offsetY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p[0] * zoom + offsetX, p[1] * zoom + offsetY);
  }
}

function redraw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: Stroke[],
  currentPoints: Point[],
  currentColor: string,
  currentWidth: number,
  viewport: { x: number; y: number; zoom: number },
): void {
  ctx.clearRect(0, 0, width, height);

  const { x: offsetX, y: offsetY, zoom } = viewport;

  for (const stroke of strokes) {
    renderStroke(
      ctx,
      stroke.points,
      stroke.color,
      stroke.width,
      zoom,
      offsetX,
      offsetY,
    );
  }

  if (currentPoints.length >= 2) {
    renderStroke(
      ctx,
      currentPoints,
      currentColor,
      currentWidth,
      zoom,
      offsetX,
      offsetY,
    );
  }
}

// ---------------------------------------------------------------------------
// Component (render-only — no pointer event capture)
// ---------------------------------------------------------------------------

export const DrawingLayer = forwardRef<DrawingLayerHandle, DrawingLayerProps>(
  function DrawingLayer(
    { strokes, viewport, containerWidth, containerHeight },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentPointsRef = useRef<Point[]>([]);
    const currentColorRef = useRef('#000000');
    const currentWidthRef = useRef(2);
    const rafIdRef = useRef<number>(0);

    const viewportRef = useRef(viewport);
    viewportRef.current = viewport;

    const strokesRef = useRef(strokes);
    strokesRef.current = strokes;

    // ----- Redraw scheduling -----------------------------------------------

    const scheduleRedraw = useCallback(() => {
      if (rafIdRef.current) return;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        redraw(
          ctx,
          canvas.width,
          canvas.height,
          strokesRef.current,
          currentPointsRef.current,
          currentColorRef.current,
          currentWidthRef.current,
          viewportRef.current,
        );
      });
    }, []);

    // ----- Imperative handle -----------------------------------------------

    useImperativeHandle(
      ref,
      () => ({
        beginLiveStroke(color: string, width: number) {
          currentPointsRef.current = [];
          currentColorRef.current = color;
          currentWidthRef.current = width;
        },

        addLivePoint(worldX: number, worldY: number, pressure: number) {
          currentPointsRef.current.push([worldX, worldY, pressure]);
          scheduleRedraw();
        },

        endLiveStroke(): Point[] {
          const points = [...currentPointsRef.current];
          currentPointsRef.current = [];
          scheduleRedraw();
          return points;
        },
      }),
      [scheduleRedraw],
    );

    // ----- Canvas sizing (retina-aware) ------------------------------------

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = containerWidth * dpr;
      canvas.height = containerHeight * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      scheduleRedraw();
    }, [containerWidth, containerHeight, scheduleRedraw]);

    // ----- Redraw when strokes or viewport change --------------------------

    useEffect(() => {
      scheduleRedraw();
    }, [strokes, viewport, scheduleRedraw]);

    // ----- Cleanup ---------------------------------------------------------

    useEffect(() => {
      return () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
      };
    }, []);

    // ----- Render ----------------------------------------------------------

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: containerWidth,
          height: containerHeight,
          pointerEvents: 'none',
          touchAction: 'none',
        }}
      />
    );
  },
);
