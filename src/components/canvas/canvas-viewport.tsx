'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { useGesture } from '@use-gesture/react';
import { useViewport } from '@/lib/canvas/viewport-store';
import { MIN_ZOOM, MAX_ZOOM } from '@/lib/canvas/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How much the zoom changes per wheel "click" (percentage). */
const WHEEL_ZOOM_SPEED = 0.001;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CanvasViewportProps {
  children?: ReactNode;
  /** Optional CSS class applied to the outermost container. */
  className?: string;
  /** Canvas background color or CSS value. Defaults to transparent. */
  background?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Infinite canvas viewport with pan and zoom.
 *
 * Gesture handling (via @use-gesture/react):
 * - **Drag** — pans the viewport (two-finger on touch, middle-click on mouse).
 * - **Pinch** — pinch-to-zoom on touch devices.
 * - **Wheel** — scroll-wheel zoom centered on the cursor position.
 *
 * The viewport transform is applied to an inner div using CSS
 * `translate3d` + `scale` for GPU-accelerated rendering.
 */
export function CanvasViewport({
  children,
  className,
  background,
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewport, pan, zoomTo } = useViewport();

  // ---------------------------------------------------------------------------
  // Prevent native browser pinch-zoom on the container so we can
  // handle it ourselves via the gesture system.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const preventGesture = (e: Event) => e.preventDefault();

    // Safari & Chrome fire 'gesturestart' / 'gesturechange' for trackpad
    // pinch — we must cancel them to avoid the native page zoom.
    el.addEventListener('gesturestart', preventGesture, { passive: false });
    el.addEventListener('gesturechange', preventGesture, { passive: false });

    // Prevent wheel events with ctrlKey (Chrome trackpad pinch emulation).
    const preventCtrlWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener('wheel', preventCtrlWheel, { passive: false });

    return () => {
      el.removeEventListener('gesturestart', preventGesture);
      el.removeEventListener('gesturechange', preventGesture);
      el.removeEventListener('wheel', preventCtrlWheel);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Gesture bindings
  // ---------------------------------------------------------------------------
  const bind = useGesture(
    {
      // -----------------------------------------------------------------------
      // Drag — pans the viewport
      // We use `movement` which gives the accumulated delta from the drag start,
      // but we call `pan()` with the per-frame delta (`delta`) so we stay
      // additive with the reducer.
      // -----------------------------------------------------------------------
      onDrag: ({ delta: [dx, dy], event }) => {
        event.preventDefault();
        pan(dx, dy);
      },

      // -----------------------------------------------------------------------
      // Pinch — touch pinch-to-zoom
      // The pinch handler reports `offset[0]` as the accumulated scale factor.
      // We compute the desired zoom relative to the initial zoom at drag start
      // by tracking origin via `memo`.
      // -----------------------------------------------------------------------
      onPinch: ({ origin: [ox, oy], offset: [scale], memo }) => {
        if (!containerRef.current) return memo;

        const rect = containerRef.current.getBoundingClientRect();
        const centerX = ox - rect.left;
        const centerY = oy - rect.top;

        // `memo` stores the base zoom when the gesture started so we can
        // compute an absolute target zoom from the relative scale offset.
        const baseZoom: number = memo ?? viewport.zoom;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
        zoomTo(nextZoom, centerX, centerY);

        return baseZoom;
      },

      // -----------------------------------------------------------------------
      // Wheel — scroll-wheel zoom centered on cursor
      // -----------------------------------------------------------------------
      onWheel: ({ event }) => {
        // When ctrlKey is set the browser is translating a trackpad pinch into
        // a wheel event — we still treat it as zoom.
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const centerX = event.clientX - rect.left;
        const centerY = event.clientY - rect.top;

        // Negative deltaY = zoom in, positive = zoom out.
        const zoomDelta = -event.deltaY * WHEEL_ZOOM_SPEED;
        const nextZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, viewport.zoom * (1 + zoomDelta)),
        );

        zoomTo(nextZoom, centerX, centerY);
      },
    },
    {
      target: containerRef,
      drag: {
        // Only start drag on left-click or touch; avoid interfering with
        // native text selection inside child elements.
        filterTaps: true,
      },
      pinch: {
        // Scale limits match our MIN_ZOOM / MAX_ZOOM.
        scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM },
        // rubberband on limits
        rubberband: true,
      },
      wheel: {
        // We handle the event manually; prevent the default scroll.
        eventOptions: { passive: false },
      },
    },
  );

  // When `target` is provided, @use-gesture attaches listeners via useEffect
  // directly to the ref — no need to spread bind() onto the element.
  void bind;

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full overflow-hidden', className)}
      style={{
        touchAction: 'none',
        background: background ?? undefined,
      }}
    >
      {/* Transformed layer — children live in canvas/world coordinates. */}
      <div
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
