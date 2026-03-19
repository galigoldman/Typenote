'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4.0;
const DOUBLE_TAP_DELAY = 500;

interface UsePinchZoomOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function usePinchZoom({
  containerRef,
  enabled = true,
  pageWidth = 794,
}: UsePinchZoomOptions & { pageWidth?: number }) {
  const [scale, setScale] = useState(1);
  const [isZooming, setIsZooming] = useState(false);

  // Auto-fit on touch devices: scale page to fill viewport width on mount
  useEffect(() => {
    const isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;
    // Account for right sidebar (~44px) on iPad
    const rightSidebar = 44;
    const availableWidth = window.innerWidth - rightSidebar;
    const fitScale = availableWidth / pageWidth;
    const newScale = Math.min(fitScale, 2);
    setScale(newScale);
    initialScaleRef.current = newScale;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Track gesture start values
  const gestureRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);

  const lastTwoTapRef = useRef(0);
  const lastSingleTapRef = useRef(0);
  const initialScaleRef = useRef(scaleRef.current);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store the initial "fit" scale so double-tap can toggle back to it
  useEffect(() => {
    initialScaleRef.current = scaleRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const resetZoom = useCallback(() => {
    setScale(initialScaleRef.current);
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

        // Double-tap detection: two-finger tap toggles between fit and 2x zoom
        const now = Date.now();
        if (now - lastTwoTapRef.current < DOUBLE_TAP_DELAY) {
          gestureRef.current = null;
          const rightSb = 44;
          const freshFit = (window.innerWidth - rightSb) / pageWidth;
          const fitScale = Math.min(freshFit, 2);
          initialScaleRef.current = fitScale;
          const zoomedScale = Math.min(fitScale * 2, MAX_SCALE);
          const isNearFit = Math.abs(scaleRef.current - fitScale) < 0.15;
          setScale(isNearFit ? zoomedScale : fitScale);
          setIsZooming(true);
          if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
          zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
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

    // Single-finger double-tap to zoom
    let singleTapTimer: ReturnType<typeof setTimeout> | null = null;
    let tapCount = 0;

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        gestureRef.current = null;
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
      }

      // Single-finger double-tap detection (only when exactly 0 fingers remain)
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        tapCount++;
        if (tapCount === 1) {
          singleTapTimer = setTimeout(() => {
            tapCount = 0;
          }, DOUBLE_TAP_DELAY);
        } else if (tapCount === 2) {
          if (singleTapTimer) clearTimeout(singleTapTimer);
          tapCount = 0;
          // Toggle zoom: recalculate fit scale fresh for accuracy
          const rightSb = 44;
          const freshFitScale = (window.innerWidth - rightSb) / pageWidth;
          const fitScale = Math.min(freshFitScale, 2);
          initialScaleRef.current = fitScale;
          const zoomedScale = Math.min(fitScale * 2, MAX_SCALE);
          const isNearFit = Math.abs(scaleRef.current - fitScale) < 0.15;
          setScale(isNearFit ? zoomedScale : fitScale);
          setIsZooming(true);
          if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
          zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
        }
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

  return { scale, isZooming, resetZoom, fitScale: initialScaleRef.current };
}
