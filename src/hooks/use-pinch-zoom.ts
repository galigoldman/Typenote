'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * GoodNotes-style pinch-to-zoom + pan.
 *
 * - "100%" means the page width fills the available container width.
 * - fitScale is recalculated on container resize (chat panel open/close, etc.).
 * - Pinch zooms toward the midpoint between two fingers.
 * - Two-finger pan works via native scroll when zoomed in.
 * - Double-tap toggles between 100% and 200%.
 * - Ctrl+wheel zoom supported on desktop.
 */

const MAX_ZOOM = 4.0; // 400%
const MIN_ZOOM = 1.0; // 100% — can't zoom out past fit
const DOUBLE_TAP_DELAY = 300;

interface UsePinchZoomOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  pageWidth?: number;
}

export function usePinchZoom({
  containerRef,
  enabled = true,
  pageWidth = 794,
}: UsePinchZoomOptions) {
  // fitScale: CSS scale value at which pageWidth fills the container width
  const [fitScale, setFitScale] = useState(1);
  // zoom: user zoom multiplier (1.0 = 100% = page fills width)
  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);

  const zoomRef = useRef(zoom);
  const fitScaleRef = useRef(fitScale);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  // Actual CSS scale applied to the content
  const scale = fitScale * zoom;

  // Compute fitScale on mount and whenever the container resizes.
  // On touch devices (iPad): scale up to fill the available width.
  // On desktop: never scale up past natural size — just center the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const computeFit = () => {
      const w = container.clientWidth;
      if (w > 0) {
        const raw = w / pageWidth;
        // On desktop, cap at 1 so the page stays at natural 794px width
        const newFit = isTouchDevice ? raw : Math.min(raw, 1);
        setFitScale(newFit);
        fitScaleRef.current = newFit;
      }
    };

    computeFit();
    const observer = new ResizeObserver(computeFit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, pageWidth]);

  // Gesture tracking
  const gestureRef = useRef<{
    startDistance: number;
    startZoom: number;
    // Midpoint of the two fingers relative to the container viewport
    midX: number;
    midY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);

  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showZoomIndicator = useCallback(() => {
    setIsZooming(true);
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    const container = containerRef.current;
    if (container) {
      container.scrollLeft = 0;
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const dist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const midpoint = (t1: Touch, t2: Touch) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };
    };

    // ── Pinch-to-zoom ──────────────────────────────────────────────

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const mid = midpoint(t1, t2);

        gestureRef.current = {
          startDistance: dist(t1, t2),
          startZoom: zoomRef.current,
          midX: mid.x,
          midY: mid.y,
          startScrollLeft: container.scrollLeft,
          startScrollTop: container.scrollTop,
        };
        setIsZooming(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !gestureRef.current) return;
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const g = gestureRef.current;

      // Calculate new zoom from pinch ratio
      const currentDist = dist(t1, t2);
      const ratio = currentDist / g.startDistance;
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, g.startZoom * ratio),
      );

      // Zoom toward the original pinch midpoint:
      // The content point under the midpoint should stay under the midpoint.
      const oldScale = fitScaleRef.current * g.startZoom;
      const newScale = fitScaleRef.current * newZoom;

      const contentX = (g.startScrollLeft + g.midX) / oldScale;
      const contentY = (g.startScrollTop + g.midY) / oldScale;

      let newScrollLeft = contentX * newScale - g.midX;
      let newScrollTop = contentY * newScale - g.midY;

      // Also handle two-finger pan: offset by how much the midpoint moved
      const currentMid = midpoint(t1, t2);
      newScrollLeft += g.midX - currentMid.x;
      newScrollTop += g.midY - currentMid.y;

      setZoom(newZoom);

      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, newScrollLeft);
        container.scrollTop = Math.max(0, newScrollTop);
      });
    };

    // ── Double-tap detection ───────────────────────────────────────

    let tapCount = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        gestureRef.current = null;
        showZoomIndicator();
      }

      // Single-finger double-tap: toggle 100% ↔ 200%
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        tapCount++;
        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            tapCount = 0;
          }, DOUBLE_TAP_DELAY);
        } else if (tapCount === 2) {
          if (tapTimer) clearTimeout(tapTimer);
          tapCount = 0;

          const isNearFit = Math.abs(zoomRef.current - 1) < 0.15;
          const target = isNearFit ? Math.min(2, MAX_ZOOM) : 1;
          setZoom(target);
          showZoomIndicator();

          // Reset horizontal scroll when zooming back to fit
          if (!isNearFit) {
            requestAnimationFrame(() => {
              container.scrollLeft = 0;
            });
          }
        }
      }
    };

    // ── Ctrl+Wheel zoom (desktop) ──────────────────────────────────

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const delta = -e.deltaY * 0.01;
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, zoomRef.current * (1 + delta)),
      );

      const oldScale = fitScaleRef.current * zoomRef.current;
      const newScale = fitScaleRef.current * newZoom;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom toward mouse cursor
      const contentX = (container.scrollLeft + mouseX) / oldScale;
      const contentY = (container.scrollTop + mouseY) / oldScale;

      const newScrollLeft = contentX * newScale - mouseX;
      const newScrollTop = contentY * newScale - mouseY;

      setZoom(newZoom);
      showZoomIndicator();

      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, newScrollLeft);
        container.scrollTop = Math.max(0, newScrollTop);
      });
    };

    container.addEventListener('touchstart', handleTouchStart, {
      passive: false,
      capture: true,
    });
    container.addEventListener('touchmove', handleTouchMove, {
      passive: false,
      capture: true,
    });
    container.addEventListener('touchend', handleTouchEnd, { capture: true });
    container.addEventListener('touchcancel', handleTouchEnd, {
      capture: true,
    });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart, {
        capture: true,
      });
      container.removeEventListener('touchmove', handleTouchMove, {
        capture: true,
      });
      container.removeEventListener('touchend', handleTouchEnd, {
        capture: true,
      });
      container.removeEventListener('touchcancel', handleTouchEnd, {
        capture: true,
      });
      container.removeEventListener('wheel', handleWheel);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    };
  }, [containerRef, enabled, showZoomIndicator]);

  // Display percentage: zoom * 100 (1.0 = 100%)
  const displayPercent = Math.round(zoom * 100);

  return { scale, zoom, fitScale, isZooming, resetZoom, displayPercent };
}
