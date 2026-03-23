# Quickstart: Fix Pen Double-Tap Triggering Zoom

## What changed

Added redundant PointerEvent-based pen detection to the double-tap zoom handler in `use-pinch-zoom.ts`. Pen taps are now excluded from zoom using both `TouchEvent.touchType` (Apple-specific) and `PointerEvent.pointerType` (W3C standard).

## Files modified

- `src/hooks/use-pinch-zoom.ts` — Added `lastPointerType` tracking via `pointerdown` listener; updated double-tap guard and stylus-lift reset conditions

## How to test

1. Open the app on an iPad with Apple Pencil
2. Double-tap the canvas with the pen — should NOT zoom
3. Double-tap the canvas with a finger — should zoom (100% ↔ 200%)
4. Draw with the pen — should work normally, no accidental zoom on rapid lift-and-place
5. Test on both localhost (`pnpm dev`) and Vercel preview deployment
