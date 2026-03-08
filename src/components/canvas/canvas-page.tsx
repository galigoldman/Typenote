'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { CanvasPage as CanvasPageData, CanvasTool } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { setupHighDPICanvas } from '@/lib/canvas/coordinate-utils';
import { renderStroke } from '@/lib/canvas/stroke-utils';

interface CanvasPageProps {
  page: CanvasPageData;
  activeTool: CanvasTool;
  onStrokeAdd: (pageId: string, stroke: CanvasPageData['strokes'][0]) => void;
  onStrokeRemove?: (pageId: string, strokeId: string) => void;
  onPointerDown?: (e: React.PointerEvent, pageId: string) => void;
  onPointerMove?: (e: React.PointerEvent, pageId: string) => void;
  onPointerUp?: (e: React.PointerEvent, pageId: string) => void;
  canvasClass?: string;
}

export function CanvasPage({
  page,
  activeTool,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  canvasClass,
}: CanvasPageProps) {
  const committedCanvasRef = useRef<HTMLCanvasElement>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const committedCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const workingCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Setup canvases for high-DPI on mount
  useEffect(() => {
    if (committedCanvasRef.current) {
      committedCtxRef.current = setupHighDPICanvas(
        committedCanvasRef.current,
        PAGE_WIDTH,
        PAGE_HEIGHT,
      );
    }
    if (workingCanvasRef.current) {
      workingCtxRef.current = setupHighDPICanvas(
        workingCanvasRef.current,
        PAGE_WIDTH,
        PAGE_HEIGHT,
      );
    }
  }, []);

  // Native event listeners to prevent browser text selection for pen/touch
  // React synthetic events can't reliably preventDefault on passive touch listeners
  useEffect(() => {
    const el = interactionLayerRef.current;
    if (!el) return;

    const preventForPen = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        e.preventDefault();
      }
    };

    const preventTouch = (e: TouchEvent) => {
      // Prevent default touch behavior (text selection, scroll) on the canvas
      e.preventDefault();
    };

    el.addEventListener('pointerdown', preventForPen, { passive: false });
    el.addEventListener('pointermove', preventForPen, { passive: false });
    el.addEventListener('pointerup', preventForPen, { passive: false });
    el.addEventListener('touchstart', preventTouch, { passive: false });
    el.addEventListener('touchmove', preventTouch, { passive: false });
    el.addEventListener('touchend', preventTouch, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', preventForPen);
      el.removeEventListener('pointermove', preventForPen);
      el.removeEventListener('pointerup', preventForPen);
      el.removeEventListener('touchstart', preventTouch);
      el.removeEventListener('touchmove', preventTouch);
      el.removeEventListener('touchend', preventTouch);
    };
  }, []);

  // Re-render committed strokes when page.strokes changes
  const renderCommittedStrokes = useCallback(() => {
    const ctx = committedCtxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    for (const stroke of page.strokes) {
      renderStroke(ctx, stroke.points, {
        color: stroke.color,
        size: stroke.width,
      });
    }
  }, [page.strokes]);

  useEffect(() => {
    renderCommittedStrokes();
  }, [renderCommittedStrokes]);

  const handlePointerDown = (e: React.PointerEvent) => {
    onPointerDown?.(e, page.id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    onPointerMove?.(e, page.id);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    onPointerUp?.(e, page.id);
  };

  // Determine pointer-events on text layer based on active tool
  const textLayerPointerEvents =
    activeTool === 'pen' || activeTool === 'eraser' ? 'none' : 'auto';

  return (
    <div
      className="relative bg-white shadow-md mx-auto"
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        marginBottom: 20,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Layer 1: Page background (canvas styles like lined/grid) */}
      <div
        className={`absolute inset-0 ${canvasClass ?? ''}`}
        style={{ pointerEvents: 'none' }}
      />

      {/* Layer 2: Committed canvas (finalized strokes) */}
      <canvas
        ref={committedCanvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      />

      {/* Layer 3: Working canvas (in-progress stroke) */}
      <canvas
        ref={workingCanvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      />

      {/* Layer 4: Text content layer */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: textLayerPointerEvents }}
      >
        {/* Flow content TipTap editor will be rendered here in US2 */}
        {/* Text boxes will be rendered here in US5 */}
      </div>

      {/* Layer 5: Interaction layer (captures pointer events) */}
      <div
        ref={interactionLayerRef}
        className="absolute inset-0"
        style={{
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}

/**
 * Exposes canvas refs for the drawing hook to render into.
 * This is accessed via a ref from the parent.
 */
export type CanvasPageHandle = {
  getWorkingCtx: () => CanvasRenderingContext2D | null;
  getCommittedCtx: () => CanvasRenderingContext2D | null;
  redrawCommitted: () => void;
};
