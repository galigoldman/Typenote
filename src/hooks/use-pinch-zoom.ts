'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4.0;
const DOUBLE_TAP_DELAY = 300;

interface UsePinchZoomOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function usePinchZoom({
  containerRef,
  enabled = true,
}: UsePinchZoomOptions) {
  const [scale, setScale] = useState(1);
  const [isZooming, setIsZooming] = useState(false);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Track gesture start values
  const gestureRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);

  const lastTwoTapRef = useRef(0);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetZoom = useCallback(() => {
    setScale(1);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const getDistance = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        gestureRef.current = {
          startDistance: getDistance(t1, t2),
          startScale: scaleRef.current,
        };
        setIsZooming(true);

        // Double-tap detection: two-finger tap
        const now = Date.now();
        if (now - lastTwoTapRef.current < DOUBLE_TAP_DELAY) {
          gestureRef.current = null;
          setScale(1);
          lastTwoTapRef.current = 0;
          return;
        }
        lastTwoTapRef.current = now;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !gestureRef.current) return;
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const g = gestureRef.current;

      const currentDistance = getDistance(t1, t2);
      const scaleRatio = currentDistance / g.startDistance;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, g.startScale * scaleRatio),
      );

      setScale(newScale);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        gestureRef.current = null;
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
      }
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
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    };
  }, [containerRef, enabled]);

  return { scale, isZooming, resetZoom };
}
