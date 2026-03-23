# Quickstart: Improve Document Zoom UX

**Feature**: 019-improve-document-zoom
**Date**: 2026-03-23

## What This Feature Does

Improves the iPad document zoom experience to match the quality of GoodNotes/Notability:

- **Focal-point pinch zoom**: Content under your fingers stays put while zooming
- **Sub-100% zoom**: Zoom out to 25% for a bird's-eye overview
- **Smooth animations**: Double-tap zoom animates with spring physics
- **Rubber-band feedback**: Elastic resistance at zoom/pan boundaries
- **Momentum panning**: Flick to scroll with natural deceleration

## Architecture Overview

### Before (current)

```
usePinchZoom → { zoom, fitScale }
   ↓
CSS: transform: scale(fitScale * zoom)
Pan: container.scrollLeft / scrollTop (native browser scroll)
```

### After (new)

```
usePinchZoom → { camera: { x, y, zoom, fitScale } }
   ↓
CSS: transform: scale(camera.fitScale * camera.zoom) translate(camera.x, camera.y)
Pan: camera.x / camera.y (managed in JS, no native scroll)
Animations: requestAnimationFrame + spring physics
```

### Key Concept: The Camera Model

Think of the camera as a virtual window looking at the document. The camera has:

- **Position** (`x, y`): Where the window is pointed
- **Zoom** (`zoom`): How close the window is

All coordinate conversions go through the camera:

```
screenToContent(point) = (point - cameraOffset) / cameraScale
contentToScreen(point) = point * cameraScale + cameraOffset
```

**Why this matters for interviews**: This is the same "model-view" separation used in game engines, mapping apps, and design tools. Understanding coordinate spaces and affine transforms is a fundamental graphics concept.

## Files Changed

| File                                      | Change           | Why                                                    |
| ----------------------------------------- | ---------------- | ------------------------------------------------------ |
| `src/hooks/use-pinch-zoom.ts`             | Major rewrite    | Camera model, spring animations, momentum              |
| `src/lib/canvas/zoom-physics.ts`          | New file         | Pure functions: spring solver, momentum, rubber-band   |
| `src/lib/canvas/coordinate-utils.ts`      | Add functions    | `screenToContent()`, `contentToScreen()`               |
| `src/components/canvas/canvas-editor.tsx` | Update transform | New CSS transform from camera, remove scroll-based pan |
| `src/components/canvas/canvas-page.tsx`   | Verify           | Ensure coordinate transforms still work                |

## How to Test

1. **Focal-point zoom**: Open a document with content, pinch on a specific word — it should stay under your fingers.
2. **Sub-100% zoom**: Pinch inward past fit-to-width — the page should shrink with margins around it.
3. **Double-tap**: Double-tap to zoom in — should animate smoothly (not snap). Double-tap again to return to 100%.
4. **Momentum**: Zoom to 200%, then flick horizontally — content should continue scrolling and decelerate.
5. **Rubber-band**: At max zoom, keep pinching outward — zoom should resist and spring back.
6. **Drawing accuracy**: At various zoom levels, draw strokes and verify they appear under the pen tip, not offset.

## Key Concepts for Interviews

1. **Coordinate spaces**: Screen space vs. content space. The camera transform maps between them.
2. **Spring physics**: Critically-damped harmonic oscillator for natural animations. Stiffness/damping tradeoff.
3. **Focal-point zoom math**: Translate-scale-translate-back pattern. Why the pinch midpoint stays fixed.
4. **requestAnimationFrame**: How browser rendering works. Why we cap `dt` at 32ms. How to make animations interruptible.
5. **Rubber-band formula**: Apple's asymptotic resistance curve. Why `f(x) → d` as `x → ∞`.
6. **Exponential decay for momentum**: Why it feels natural (models friction). Relationship between per-frame decay rate and time constant.
