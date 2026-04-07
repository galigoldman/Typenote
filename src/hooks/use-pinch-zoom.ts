'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type Camera,
  type GestureState,
  type SpringState,
  DOUBLE_TAP_DELAY,
  MAX_ZOOM,
  MIN_ZOOM,
  MOMENTUM_DECAY,
  MOMENTUM_STOP,
  SPRING_THRESHOLD,
  clampOffset,
  clampZoom,
  focalPointOffset,
  isMomentumStopped,
  isSpringSettled,
  momentumStep,
  rubberBand,
  springStep,
} from '@/lib/canvas/zoom-physics';

/**
 * GoodNotes-style pinch-to-zoom + pan using a camera model.
 *
 * Instead of relying on native browser scroll for panning, the camera
 * model ({x, y, zoom, fitScale}) manages both zoom and pan in a single
 * CSS transform. This enables:
 *   - Focal-point pinch zoom (content under fingers stays stationary)
 *   - Sub-100% zoom (zoom out to 25% for overview)
 *   - Smooth animated transitions (spring physics for double-tap)
 *   - Rubber-band overscroll at boundaries
 *   - Momentum-based panning with deceleration
 */

// ── Stylus detection ────────────────────────────────────────────────
// On iPadOS, Apple Pencil touches have touchType === "stylus".
// Zoom/pan should only respond to finger touches ("direct"), never pen.

export const hasStylus = (touches: TouchList) => {
  for (let i = 0; i < touches.length; i++) {
    if ((touches[i] as Touch & { touchType?: string }).touchType === 'stylus') {
      return true;
    }
  }
  return false;
};

/**
 * Returns true if a touch-end event should be allowed to count towards
 * double-tap zoom. Pen/stylus taps are excluded using two independent
 * detection methods for robustness.
 */
export const shouldCountAsDoubleTap = (
  changedTouches: TouchList,
  lastPointerType: string,
) => !hasStylus(changedTouches) && lastPointerType !== 'pen';

interface UsePinchZoomOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  pageWidth?: number;
  /** Total content height in logical pixels (PAGE_HEIGHT * pageCount) */
  contentHeight?: number;
  /** When true, let the browser handle vertical scrolling natively
   *  instead of panning camera.y via the wheel handler. */
  nativeVerticalScroll?: boolean;
}

export function usePinchZoom({
  containerRef,
  enabled = true,
  pageWidth = 794,
  contentHeight = 1123,
  nativeVerticalScroll = false,
}: UsePinchZoomOptions) {
  const [camera, setCamera] = useState<Camera>({
    x: 0,
    y: 0,
    zoom: 1,
    fitScale: 1,
  });
  const [isZooming, setIsZooming] = useState(false);

  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const contentHeightRef = useRef(contentHeight);
  useEffect(() => {
    contentHeightRef.current = contentHeight;
  }, [contentHeight]);

  // Derived values
  const scale = camera.fitScale * camera.zoom;
  const displayPercent = Math.round(camera.zoom * 100);

  // ── Gesture tracking ─────────────────────────────────────────────
  const gestureRef = useRef<GestureState | null>(null);
  const animRafRef = useRef<number | null>(null);
  const momentumRafRef = useRef<number | null>(null);

  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showZoomIndicator = useCallback(() => {
    setIsZooming(true);
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
  }, []);

  /** Cancel any running animation (spring or momentum). */
  const cancelAnimations = useCallback(() => {
    if (animRafRef.current !== null) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
  }, []);

  /**
   * Compute clamped camera offsets for the current zoom level.
   * Centers the content when it fits, otherwise clamps to pan bounds.
   */
  const clampCamera = useCallback(
    (cam: Camera): Camera => {
      const container = containerRef.current;
      if (!container) return cam;

      const s = cam.fitScale * cam.zoom;
      const scaledW = pageWidth * s;
      const scaledH = contentHeightRef.current * s;
      const vw = container.clientWidth;
      const vh = container.clientHeight;

      return {
        ...cam,
        x: clampOffset(cam.x, scaledW, vw),
        y: clampOffset(cam.y, scaledH, vh),
      };
    },
    [containerRef, pageWidth],
  );

  // ── Animated camera transitions (spring physics) ─────────────────

  /**
   * Animate camera to a target state using critically-damped springs.
   * Used for double-tap zoom, zoom reset, and rubber-band snap-back.
   */
  const animateCamera = useCallback(
    (target: { x: number; y: number; zoom: number }) => {
      cancelAnimations();

      const cam = cameraRef.current;
      let springX: SpringState = {
        position: cam.x,
        velocity: 0,
        target: target.x,
      };
      let springY: SpringState = {
        position: cam.y,
        velocity: 0,
        target: target.y,
      };
      let springZ: SpringState = {
        position: cam.zoom,
        velocity: 0,
        target: target.zoom,
      };
      let lastTime = performance.now();

      const tick = (now: number) => {
        const dt = Math.min((now - lastTime) / 1000, 0.032);
        lastTime = now;

        springX = springStep(springX, dt);
        springY = springStep(springY, dt);
        springZ = springStep(springZ, dt);

        const newCam: Camera = {
          x: springX.position,
          y: springY.position,
          zoom: springZ.position,
          fitScale: cameraRef.current.fitScale,
        };

        setCamera(newCam);
        cameraRef.current = newCam;

        if (
          isSpringSettled(springX) &&
          isSpringSettled(springY) &&
          isSpringSettled(springZ)
        ) {
          // Snap to exact target
          const final = clampCamera({
            ...newCam,
            x: target.x,
            y: target.y,
            zoom: target.zoom,
          });
          setCamera(final);
          cameraRef.current = final;
          animRafRef.current = null;
          return;
        }

        animRafRef.current = requestAnimationFrame(tick);
      };

      animRafRef.current = requestAnimationFrame(tick);
    },
    [cancelAnimations, clampCamera],
  );

  // ── Reset zoom ───────────────────────────────────────────────────

  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const s = cameraRef.current.fitScale * 1; // target zoom = 1
    const scaledW = pageWidth * s;
    const vw = container.clientWidth;

    animateCamera({
      x: clampOffset(0, scaledW, vw),
      y: 0,
      zoom: 1,
    });
    showZoomIndicator();
  }, [containerRef, pageWidth, animateCamera, showZoomIndicator]);

  // ── Compute fitScale on mount and resize ──────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // "Pure touch device" = has a coarse pointer AND no fine pointer at all.
    // We deliberately do NOT use `navigator.maxTouchPoints > 0` here, because that
    // returns true on Windows touchscreen laptops (which also have a trackpad) and
    // would incorrectly stretch the page to fill the viewport on those machines.
    // This media query mirrors the `pointer-touch:` Tailwind variant defined in
    // `globals.css`, so the JS fit logic and the CSS layout stay in sync.
    const isPureTouchDevice = window.matchMedia(
      '(any-pointer: coarse) and (not (any-pointer: fine))',
    ).matches;

    const computeFit = () => {
      const w = container.clientWidth;
      if (w <= 0) return;

      const raw = w / pageWidth;
      const newFit = isPureTouchDevice ? raw : Math.min(raw, 1);

      setCamera((prev) => {
        const updated: Camera = { ...prev, fitScale: newFit };
        // Re-clamp offsets after resize
        const s = newFit * prev.zoom;
        const scaledW = pageWidth * s;
        const scaledH = contentHeightRef.current * s;
        const vw = container.clientWidth;
        const vh = container.clientHeight;

        updated.x = clampOffset(prev.x, scaledW, vw);
        updated.y = clampOffset(prev.y, scaledH, vh);

        cameraRef.current = updated;
        return updated;
      });
    };

    computeFit();
    const observer = new ResizeObserver(computeFit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, pageWidth]);

  // ── Touch + Wheel event handlers ──────────────────────────────────

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
      if (e.touches.length === 2 && !hasStylus(e.touches)) {
        e.preventDefault();
        // Cancel any running animation when gesture starts
        cancelAnimations();

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const mid = midpoint(t1, t2);
        const cam = cameraRef.current;

        gestureRef.current = {
          startDistance: dist(t1, t2),
          startZoom: cam.zoom,
          startX: cam.x,
          startY: cam.y,
          midX: mid.x,
          midY: mid.y,
        };
        setIsZooming(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !gestureRef.current || hasStylus(e.touches))
        return;
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const g = gestureRef.current;
      const cam = cameraRef.current;

      // Calculate new zoom from pinch ratio
      const currentDist = dist(t1, t2);
      const ratio = currentDist / g.startDistance;
      const rawZoom = g.startZoom * ratio;
      // Allow exceeding bounds during gesture for rubber-band feel
      const newZoom = rawZoom;

      // Focal-point zoom: keep content under the original midpoint stationary.
      const oldScale = cam.fitScale * g.startZoom;
      const newScale = cam.fitScale * newZoom;

      // Convert original midpoint to content space using start camera
      const contentX = (g.midX - g.startX) / oldScale;
      const contentY = (g.midY - g.startY) / oldScale;

      // Compute new offset so the content point stays at the midpoint
      let newX = focalPointOffset(g.midX, contentX, newScale);
      let newY = focalPointOffset(g.midY, contentY, newScale);

      // Two-finger pan: offset by how much the midpoint moved
      const currentMid = midpoint(t1, t2);
      newX += currentMid.x - g.midX;
      newY += currentMid.y - g.midY;

      // Apply rubber-band to zoom if past boundaries
      const displayZoom =
        newZoom > MAX_ZOOM
          ? MAX_ZOOM + rubberBand(newZoom - MAX_ZOOM, 1.0)
          : newZoom < MIN_ZOOM
            ? MIN_ZOOM - rubberBand(MIN_ZOOM - newZoom, 1.0)
            : newZoom;

      // Recompute offsets with displayed (rubber-banded) zoom
      const displayScale = cam.fitScale * displayZoom;
      const displayX = focalPointOffset(g.midX, contentX, displayScale);
      const displayY = focalPointOffset(g.midY, contentY, displayScale);
      const finalX = displayX + (currentMid.x - g.midX);
      const finalY = displayY + (currentMid.y - g.midY);

      const newCam: Camera = {
        x: finalX,
        y: finalY,
        zoom: displayZoom,
        fitScale: cam.fitScale,
      };

      setCamera(newCam);
      cameraRef.current = newCam;
    };

    // ── PointerEvent pen tracking ────────────────────────────────────
    // Track the last pointer type (W3C standard: "mouse" | "touch" | "pen")
    // as a redundant guard for double-tap detection. PointerEvent.pointerType
    // is more reliable than the iPadOS-specific Touch.touchType across all
    // browsers and deployment contexts.
    let lastPointerType = '';

    const handlePointerDown = (e: PointerEvent) => {
      lastPointerType = e.pointerType;
    };

    // ── Double-tap detection ───────────────────────────────────────

    let tapCount = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTapX = 0;
    let lastTapY = 0;

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && gestureRef.current) {
        // Pinch ended — snap back if zoom is out of bounds
        const cam = cameraRef.current;
        gestureRef.current = null;

        if (cam.zoom > MAX_ZOOM || cam.zoom < MIN_ZOOM) {
          const targetZoom = clampZoom(cam.zoom);
          const clamped = clampCamera({ ...cam, zoom: targetZoom });
          animateCamera({
            x: clamped.x,
            y: clamped.y,
            zoom: targetZoom,
          });
        } else {
          // Clamp pan offsets
          const clamped = clampCamera(cam);
          if (clamped.x !== cam.x || clamped.y !== cam.y) {
            animateCamera({
              x: clamped.x,
              y: clamped.y,
              zoom: cam.zoom,
            });
          }
        }
        showZoomIndicator();
      }

      // Single-finger double-tap: toggle 100% ↔ 200%
      // Skip stylus touches — pen taps must never trigger zoom (FR-001)
      // Uses both TouchEvent.touchType AND PointerEvent.pointerType for
      // robust pen detection across all browsers and deployment contexts.
      if (
        e.touches.length === 0 &&
        e.changedTouches.length === 1 &&
        shouldCountAsDoubleTap(e.changedTouches, lastPointerType)
      ) {
        const touch = e.changedTouches[0];
        const rect = container.getBoundingClientRect();
        const tapX = touch.clientX - rect.left;
        const tapY = touch.clientY - rect.top;

        tapCount++;
        if (tapCount === 1) {
          lastTapX = tapX;
          lastTapY = tapY;
          tapTimer = setTimeout(() => {
            tapCount = 0;
          }, DOUBLE_TAP_DELAY);
        } else if (tapCount === 2) {
          if (tapTimer) clearTimeout(tapTimer);
          tapCount = 0;

          const cam = cameraRef.current;
          const isNearFit = Math.abs(cam.zoom - 1) < 0.15;
          const targetZoom = isNearFit ? Math.min(2, MAX_ZOOM) : 1;

          // Focal-point: keep the tap point stationary during zoom
          const currentScale = cam.fitScale * cam.zoom;
          const targetScale = cam.fitScale * targetZoom;

          // Content point under tap
          const contentX = (lastTapX - cam.x) / currentScale;
          const contentY = (lastTapY - cam.y) / currentScale;

          let targetX = focalPointOffset(lastTapX, contentX, targetScale);
          let targetY = focalPointOffset(lastTapY, contentY, targetScale);

          // Clamp the target position
          const scaledW = pageWidth * targetScale;
          const scaledH = contentHeightRef.current * targetScale;
          const vw = container.clientWidth;
          const vh = container.clientHeight;
          targetX = clampOffset(targetX, scaledW, vw);
          targetY = clampOffset(targetY, scaledH, vh);

          animateCamera({ x: targetX, y: targetY, zoom: targetZoom });
          showZoomIndicator();
        }
      }

      // Stylus lift — reset double-tap counter to prevent pen→finger
      // false positive (FR-006): a pen tap followed by a finger tap
      // within 300ms must not register as a double-tap.
      // Uses both detection methods for robustness.
      if (
        e.touches.length === 0 &&
        e.changedTouches.length === 1 &&
        (hasStylus(e.changedTouches) || lastPointerType === 'pen')
      ) {
        tapCount = 0;
        if (tapTimer) clearTimeout(tapTimer);
      }
    };

    // ── Wheel: scroll (plain) or zoom (Ctrl/Meta) ─────────────────

    const handleWheel = (e: WheelEvent) => {
      // Plain wheel → scroll (pan camera vertically/horizontally)
      if (!e.ctrlKey && !e.metaKey) {
        if (nativeVerticalScroll) {
          // Let the browser handle vertical scroll natively.
          // Only intercept horizontal scroll (deltaX) via camera.
          if (e.deltaX !== 0) {
            e.preventDefault();
            const cam = cameraRef.current;
            const newCam = clampCamera({ ...cam, x: cam.x - e.deltaX });
            setCamera(newCam);
            cameraRef.current = newCam;
          }
          return;
        }
        e.preventDefault();
        const cam = cameraRef.current;
        const newCam = clampCamera({
          ...cam,
          x: cam.x - e.deltaX,
          y: cam.y - e.deltaY,
        });
        setCamera(newCam);
        cameraRef.current = newCam;
        return;
      }

      // Ctrl/Meta + wheel → zoom
      e.preventDefault();

      const cam = cameraRef.current;
      const delta = -e.deltaY * 0.01;
      const newZoom = clampZoom(cam.zoom * (1 + delta));

      const currentScale = cam.fitScale * cam.zoom;
      const newScale = cam.fitScale * newZoom;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Content point under mouse cursor
      const contentX = (mouseX - cam.x) / currentScale;
      const contentY = (mouseY - cam.y) / currentScale;

      const newX = focalPointOffset(mouseX, contentX, newScale);
      const newY = focalPointOffset(mouseY, contentY, newScale);

      const newCam = clampCamera({
        x: newX,
        y: newY,
        zoom: newZoom,
        fitScale: cam.fitScale,
      });

      setCamera(newCam);
      cameraRef.current = newCam;
      showZoomIndicator();
    };

    // ── Single-finger pan + momentum (both axes) ──────────────────────

    let panStartX = 0;
    let panStartY = 0;
    let panStartCamX = 0;
    let panStartCamY = 0;
    let panVelocityX = 0;
    let panVelocityY = 0;
    let lastPanTime = 0;
    let lastPanX = 0;
    let lastPanY = 0;
    let isPanning = false;

    const handleSingleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || hasStylus(e.touches)) return;
      cancelAnimations();
      isPanning = true;
      const touch = e.touches[0];
      const cam = cameraRef.current;
      panStartX = touch.clientX;
      panStartY = touch.clientY;
      panStartCamX = cam.x;
      panStartCamY = cam.y;
      panVelocityX = 0;
      panVelocityY = 0;
      lastPanTime = performance.now();
      lastPanX = touch.clientX;
      lastPanY = touch.clientY;
    };

    const handleSingleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !isPanning) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - panStartX;
      const deltaY = touch.clientY - panStartY;
      const cam = cameraRef.current;

      // Track velocity for momentum
      const now = performance.now();
      const dt = now - lastPanTime;
      if (dt > 0) {
        panVelocityX = ((touch.clientX - lastPanX) / dt) * 16;
        panVelocityY = ((touch.clientY - lastPanY) / dt) * 16;
      }
      lastPanTime = now;
      lastPanX = touch.clientX;
      lastPanY = touch.clientY;

      const s = cam.fitScale * cam.zoom;
      const scaledW = pageWidth * s;
      const scaledH = contentHeightRef.current * s;
      const vw = container.clientWidth;
      const vh = container.clientHeight;

      let newX = panStartCamX + deltaX;
      let newY = panStartCamY + deltaY;

      // Apply rubber-band if past bounds (horizontal)
      const clampedX = clampOffset(newX, scaledW, vw);
      if (newX !== clampedX) {
        const overX = newX - clampedX;
        newX =
          clampedX +
          (overX > 0 ? rubberBand(overX, vw) : -rubberBand(-overX, vw));
      }

      // Apply rubber-band if past bounds (vertical)
      const clampedY = clampOffset(newY, scaledH, vh);
      if (newY !== clampedY) {
        const overY = newY - clampedY;
        newY =
          clampedY +
          (overY > 0 ? rubberBand(overY, vh) : -rubberBand(-overY, vh));
      }

      const newCam = { ...cam, x: newX, y: newY };
      setCamera(newCam);
      cameraRef.current = newCam;
    };

    const handleSingleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length !== 0 || !isPanning) return;
      isPanning = false;

      const cam = cameraRef.current;
      const clamped = clampCamera(cam);

      // If out of bounds, spring back
      if (clamped.x !== cam.x || clamped.y !== cam.y) {
        animateCamera({ x: clamped.x, y: clamped.y, zoom: cam.zoom });
        return;
      }

      // Apply momentum if velocity is significant
      const hasVelocity =
        !isMomentumStopped(panVelocityX) || !isMomentumStopped(panVelocityY);

      if (hasVelocity) {
        let vx = panVelocityX;
        let vy = panVelocityY;

        const momentumTick = () => {
          const cam = cameraRef.current;
          vx = momentumStep(vx, MOMENTUM_DECAY);
          vy = momentumStep(vy, MOMENTUM_DECAY);

          const newCam = { ...cam, x: cam.x + vx, y: cam.y + vy };
          const clamped = clampCamera(newCam);

          // If we hit bounds on either axis, stop and spring back
          if (clamped.x !== newCam.x || clamped.y !== newCam.y) {
            setCamera(newCam);
            cameraRef.current = newCam;
            animateCamera({ x: clamped.x, y: clamped.y, zoom: cam.zoom });
            momentumRafRef.current = null;
            return;
          }

          setCamera(clamped);
          cameraRef.current = clamped;

          if (isMomentumStopped(vx) && isMomentumStopped(vy)) {
            momentumRafRef.current = null;
            return;
          }

          momentumRafRef.current = requestAnimationFrame(momentumTick);
        };

        momentumRafRef.current = requestAnimationFrame(momentumTick);
      }
    };

    // Pinch handlers (capture phase, non-passive for preventDefault)
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

    // Single-finger pan (bubble phase — lower priority than pinch)
    container.addEventListener('touchstart', handleSingleTouchStart, {
      passive: true,
    });
    container.addEventListener('touchmove', handleSingleTouchMove, {
      passive: true,
    });
    container.addEventListener('touchend', handleSingleTouchEnd, {
      passive: true,
    });

    // PointerEvent pen tracking (fires before touch events on iOS)
    container.addEventListener('pointerdown', handlePointerDown);

    // Desktop wheel zoom
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
      container.removeEventListener('touchstart', handleSingleTouchStart);
      container.removeEventListener('touchmove', handleSingleTouchMove);
      container.removeEventListener('touchend', handleSingleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointerdown', handlePointerDown);
      cancelAnimations();
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    };
  }, [
    containerRef,
    enabled,
    pageWidth,
    nativeVerticalScroll,
    showZoomIndicator,
    cancelAnimations,
    clampCamera,
    animateCamera,
  ]);

  /** Instantly set camera.y (for page navigation). */
  const setCameraY = useCallback(
    (y: number) => {
      const cam = cameraRef.current;
      const newCam = clampCamera({ ...cam, y });
      setCamera(newCam);
      cameraRef.current = newCam;
    },
    [clampCamera],
  );

  return {
    camera,
    scale,
    zoom: camera.zoom,
    fitScale: camera.fitScale,
    isZooming,
    resetZoom,
    displayPercent,
    setCameraY,
  };
}
