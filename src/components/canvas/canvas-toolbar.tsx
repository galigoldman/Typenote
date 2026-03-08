'use client';

import { useViewport } from '@/lib/canvas/viewport-store';
import { MIN_ZOOM, MAX_ZOOM } from '@/lib/canvas/types';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Maximize } from 'lucide-react';

const ZOOM_STEP = 0.25;

export function CanvasToolbar() {
  const { viewport, zoomTo, resetViewport } = useViewport();

  const zoomPercent = Math.round(viewport.zoom * 100);

  function handleZoomIn() {
    const next = Math.min(viewport.zoom + ZOOM_STEP, MAX_ZOOM);
    // Zoom centered on viewport center — we don't know the container size
    // here, so we zoom around (0, 0) in screen space. The viewport component
    // could provide center coordinates if needed.
    zoomTo(next, window.innerWidth / 2, window.innerHeight / 2);
  }

  function handleZoomOut() {
    const next = Math.max(viewport.zoom - ZOOM_STEP, MIN_ZOOM);
    zoomTo(next, window.innerWidth / 2, window.innerHeight / 2);
  }

  function handleFitToContent() {
    resetViewport();
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleZoomOut}
        disabled={viewport.zoom <= MIN_ZOOM}
        aria-label="Zoom out"
      >
        <Minus className="size-4" />
      </Button>

      <span className="min-w-[3rem] select-none text-center text-xs tabular-nums text-muted-foreground">
        {zoomPercent}%
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleZoomIn}
        disabled={viewport.zoom >= MAX_ZOOM}
        aria-label="Zoom in"
      >
        <Plus className="size-4" />
      </Button>

      <div className="mx-0.5 h-4 w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleFitToContent}
        aria-label="Reset zoom"
      >
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}
