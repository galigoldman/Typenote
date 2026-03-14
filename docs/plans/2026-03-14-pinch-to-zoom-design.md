# Pinch-to-Zoom Design

## Goal

Add Notability-style pinch-to-zoom to the canvas editor. Two-finger pinch scales the page, two-finger drag pans, pen is never affected. Everything scales proportionally.

## Architecture

A CSS `transform: scale()` on a wrapper div inside the scroll container. All 6 page layers scale together because the transform is applied above `CanvasPage`. Coordinate conversion in `use-drawing.ts` and `use-eraser.ts` works transparently because `getBoundingClientRect()` returns visual bounds after CSS transform.

## Zoom State

- `scale`: 0.5 to 4.0, default 1.0
- Focal point: zoom centers on the midpoint between the two fingers
- Stored as React state in `canvas-editor.tsx`

## Input Rules

- **Two fingers** — pinch to zoom, drag to pan. Works in both Draw and Type mode.
- **Pen** — ONLY drawing/erasing. Never triggers zoom or pan.
- **Single finger in Draw mode** — scroll (existing behavior).
- **Double-tap with two fingers** — reset to 100%.

## Zoom Indicator

Small badge ("150%") appears during pinch gestures, fades out after ~1 second.

## Files Changed

| File | Change |
|------|--------|
| `canvas-editor.tsx` | Add zoom state, wrap pages in scaled div, attach pinch/pan gesture handler |
| `canvas-page.tsx` | No changes |
| `use-drawing.ts` | No changes — getBoundingClientRect already accounts for transforms |
| `use-eraser.ts` | No changes — same reason |
| New: `use-pinch-zoom.ts` | Hook for two-finger gesture detection (pinch + pan + double-tap reset) |
| New: `zoom-indicator.tsx` | Small fade-out badge component |

## Zoom Range

- Min: 50%
- Max: 400%
- Default: 100%

## Key Insight

`screenToPageCoords` uses `getBoundingClientRect()` which returns the element's visual bounds AFTER CSS transforms. At 2x zoom, `rect.width = PAGE_WIDTH * 2`, so `scaleX = PAGE_WIDTH / (PAGE_WIDTH * 2) = 0.5` — coordinates are automatically correct. No changes needed to drawing or erasing coordinate conversion.
