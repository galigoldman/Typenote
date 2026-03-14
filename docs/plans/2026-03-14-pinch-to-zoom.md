# Pinch-to-Zoom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Notability-style pinch-to-zoom so users can two-finger pinch to scale the canvas (50%–400%), two-finger drag to pan, and double-tap with two fingers to reset to 100%.

**Architecture:** A `usePinchZoom` hook detects two-finger gestures on the scroll container and produces `scale`/`translateX`/`translateY` values. A wrapper div inside the scroll container applies `transform: scale() translate()` to all pages. Pen input is never treated as zoom. A `ZoomIndicator` component shows the current zoom level during gestures.

**Tech Stack:** React 19, TypeScript 5, CSS transforms, Pointer Events API / Touch Events API

---

### Task 1: Create the `usePinchZoom` hook

**Files:**

- Create: `src/hooks/use-pinch-zoom.ts`

**Step 1: Create the hook**

This hook attaches touch listeners to a container ref. It tracks two-finger gestures to produce zoom scale and pan offset. It ignores pen events entirely.

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4.0;
const DOUBLE_TAP_DELAY = 300;

interface PinchZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface UsePinchZoomOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function usePinchZoom({
  containerRef,
  contentRef,
  enabled = true,
}: UsePinchZoomOptions) {
  const [state, setState] = useState<PinchZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [isZooming, setIsZooming] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Track gesture start values
  const gestureRef = useRef<{
    startDistance: number;
    startScale: number;
    startMidX: number;
    startMidY: number;
    startTranslateX: number;
    startTranslateY: number;
  } | null>(null);

  const lastTwoTapRef = useRef(0);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetZoom = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const getDistance = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getMidpoint = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two-finger gesture — start pinch/pan
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const mid = getMidpoint(t1, t2);
        gestureRef.current = {
          startDistance: getDistance(t1, t2),
          startScale: stateRef.current.scale,
          startMidX: mid.x,
          startMidY: mid.y,
          startTranslateX: stateRef.current.translateX,
          startTranslateY: stateRef.current.translateY,
        };
        setIsZooming(true);

        // Double-tap detection: two-finger tap
        const now = Date.now();
        if (now - lastTwoTapRef.current < DOUBLE_TAP_DELAY) {
          // Double-tap with two fingers — reset zoom
          gestureRef.current = null;
          setState({ scale: 1, translateX: 0, translateY: 0 });
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

      // Pinch: scale change
      const currentDistance = getDistance(t1, t2);
      const scaleRatio = currentDistance / g.startDistance;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, g.startScale * scaleRatio),
      );

      // Pan: midpoint delta
      const mid = getMidpoint(t1, t2);
      const dx = mid.x - g.startMidX;
      const dy = mid.y - g.startMidY;

      setState({
        scale: newScale,
        translateX: g.startTranslateX + dx,
        translateY: g.startTranslateY + dy,
      });
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        gestureRef.current = null;
        // Hide zoom indicator after delay
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 1000);
      }
    };

    // Use capture phase to intercept before any other handlers
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

  return { ...state, isZooming, resetZoom };
}
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (no tests for this hook yet)

**Step 3: Commit**

```bash
git add src/hooks/use-pinch-zoom.ts
git commit -m "feat: add usePinchZoom hook for two-finger zoom and pan"
```

---

### Task 2: Create the ZoomIndicator component

**Files:**

- Create: `src/components/canvas/zoom-indicator.tsx`

**Step 1: Create the component**

A small badge that shows the current zoom percentage and fades out after gestures end.

```typescript
'use client';

import { useEffect, useState } from 'react';

interface ZoomIndicatorProps {
  scale: number;
  visible: boolean;
}

export function ZoomIndicator({ scale, visible }: ZoomIndicatorProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
    } else {
      // Keep visible briefly after gesture ends (fade-out handled by CSS)
      const timeout = setTimeout(() => setShow(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [visible]);

  if (!show && !visible) return null;

  const percentage = Math.round(scale * 100);

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5
        bg-black/70 text-white text-sm font-medium rounded-full
        transition-opacity duration-500 pointer-events-none
        ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {percentage}%
    </div>
  );
}
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All existing tests pass

**Step 3: Commit**

```bash
git add src/components/canvas/zoom-indicator.tsx
git commit -m "feat: add ZoomIndicator badge component"
```

---

### Task 3: Wire pinch-to-zoom into canvas-editor.tsx

**Files:**

- Modify: `src/components/canvas/canvas-editor.tsx:1-30` (imports)
- Modify: `src/components/canvas/canvas-editor.tsx:168-182` (state section)
- Modify: `src/components/canvas/canvas-editor.tsx:795-886` (scroll container + page wrapper)

**Step 1: Add imports**

After line 30 (`import { useEraser } from '@/hooks/use-eraser';`), add:

```typescript
import { usePinchZoom } from '@/hooks/use-pinch-zoom';
import { ZoomIndicator } from './zoom-indicator';
```

**Step 2: Add refs and hook call**

After the `eraserSize` state (line 182), add:

```typescript
const scrollContainerRef = useRef<HTMLDivElement>(null);
const zoomContentRef = useRef<HTMLDivElement>(null);
const { scale, translateX, translateY, isZooming } = usePinchZoom({
  containerRef: scrollContainerRef,
  contentRef: zoomContentRef,
});
```

**Step 3: Update the scroll container to use the ref and wrap pages in a zoom div**

Replace lines 795-806 with:

```tsx
        <div
          ref={scrollContainerRef}
          className="flex-1 bg-gray-100"
          data-scroll-container
          style={{
            overflowY: activeTool === 'text' ? 'auto' : 'hidden',
            touchAction: activeTool === 'text' ? 'auto' : 'none',
            overscrollBehavior: 'none',
            userSelect: activeTool === 'text' ? 'auto' : 'none',
            WebkitUserSelect: activeTool === 'text' ? 'auto' : 'none',
          }}
        >
          <div
            ref={zoomContentRef}
            className="py-8"
            style={{
              transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
              transformOrigin: '0 0',
              willChange: scale !== 1 ? 'transform' : 'auto',
            }}
          >
```

Both closing `</div>` tags remain unchanged (lines 885-886).

**Step 4: Add the ZoomIndicator**

After the closing `</div>` of the scroll container (line 886), add:

```tsx
<ZoomIndicator scale={scale} visible={isZooming} />
```

**Step 5: Run tests**

Run: `pnpm test`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/components/canvas/canvas-editor.tsx
git commit -m "feat: wire pinch-to-zoom into canvas editor"
```

---

### Task 4: Update finger-scroll handler to skip two-finger gestures

The finger-scroll handler in `canvas-page.tsx` currently fires for single-touch events. It should not interfere with two-finger pinch/pan gestures (those are handled by `usePinchZoom` on the scroll container above).

**Files:**

- Modify: `src/components/canvas/canvas-page.tsx:108-118` (touch handlers)

**Step 1: Add guard to skip if two touches active**

The handlers already check `e.touches.length !== 1` and return early, so single-finger scroll is already isolated from two-finger gestures. **Verify this is correct — no code change needed.**

However, the `touchstart` handler uses `{ passive: true }`, which means we can't call `preventDefault` on it. This is fine because the two-finger handler in `usePinchZoom` uses capture phase and will intercept first.

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit (skip if no changes)**

No commit needed if no changes were made.

---

### Task 5: Manual testing and fixes

**Step 1: Run the dev server**

Run: `npx next dev -p 3002`

**Step 2: Test on iPad**

Open `http://192.168.0.3:3002` on iPad and test:

1. **Pinch zoom in Draw mode** — two fingers pinch to zoom in/out. Page scales.
2. **Pan while zoomed** — two-finger drag moves the zoomed view.
3. **Pen drawing while zoomed** — draw with Apple Pencil. Lines should land accurately where the pen touches (no offset).
4. **Double-tap reset** — tap with two fingers twice quickly. Zoom resets to 100%.
5. **Zoom indicator** — "150%" badge appears during pinch, fades out after ~1 second.
6. **Text mode** — switch to Type mode. Pinch zoom still works. Typing works normally.
7. **Zoom range** — verify can't zoom below 50% or above 400%.
8. **Finger scroll in Draw mode** — single-finger scroll still works when not zoomed.

**Step 3: Fix any issues found**

Common issues to watch for:

- Pan offset drifting when switching between zoom levels
- Zoom indicator not centered on iPad
- Text editor cursor position off when zoomed (if so, TipTap handles coordinates internally and should be fine since the transform is above it)

**Step 4: Run full test suite**

Run: `pnpm test`
Expected: All 157+ tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: pinch-to-zoom with pan, zoom indicator, and double-tap reset"
```
