# Implementation Plan: Type Mode Zoom Defaults

**Branch**: `018-type-mode-zoom` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)

## Summary

Make Type mode feel like Word by defaulting to a zoomed-out view (~75%) with the page centered and visible margins. Draw mode retains its current 100% fit-to-width behavior. Switching between modes changes the zoom level.

## Technical Approach

**Changes to `usePinchZoom` hook (`src/hooks/use-pinch-zoom.ts`):**

1. Add optional `minZoom` prop (default 1.0, preserving current behavior)
2. Expose `setZoom` in the return value so canvas-editor can set zoom on mode change

**Changes to `canvas-editor.tsx`:**

1. Compute `minZoom` based on `activeTool` — 0.75 for text mode, 1.0 for everything else
2. Add `useEffect` watching `activeTool` — when switching to text, set zoom to 0.75; when switching away, set zoom to 1.0
3. Pass `minZoom` to `usePinchZoom`

**Key values:**

- `TYPE_MODE_ZOOM = 0.75` (page at 75% width — shows margins like Word)
- `DRAW_MODE_ZOOM = 1.0` (page fills width — current behavior)
- `MIN_ZOOM` for type mode = 0.75 (can't zoom out past 75%)
- `MIN_ZOOM` for draw mode = 1.0 (can't zoom out past fit — current behavior)

## Files to Modify

1. `src/hooks/use-pinch-zoom.ts` — Add `minZoom` prop, expose `setZoom`
2. `src/components/canvas/canvas-editor.tsx` — Mode-switch zoom logic
