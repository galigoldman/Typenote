# Implementation Plan: Fix Region Capture Error

**Branch**: `017-fix-region-capture` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)

## Summary

The "Ask AI -> Screenshot" crop-to-AI flow fails with "Region capture failed: {}" because `html-to-image`'s `toPng` cannot properly clone the page element (which contains high-DPI canvas elements). The fix replaces it with direct canvas compositing — drawing the PDF background and committed strokes canvases onto an offscreen canvas at the crop region, producing a data URL without DOM cloning.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16, Canvas 2D API
**Testing**: Vitest
**Scale/Scope**: Single function change in `canvas-editor.tsx`

## Root Cause

`html-to-image`'s `toPng` clones the DOM tree and serializes it to SVG foreignObject. This fails when the page element contains `<canvas>` elements with high-DPI backing buffers (`canvas.width = 794 * dpr`) but CSS dimensions of `794px`. The library's canvas cloning cannot handle this mismatch, throwing an empty object `{}`.

## Fix

Replace `handleAskAiWithRegion` in `canvas-editor.tsx`:

**Before**: Uses `html-to-image` `toPng()` on the page DOM element (fragile, fails on canvas elements)

**After**: Direct canvas compositing using the canvas refs already stored in `pageCanvasRefsMap`:

1. Create an offscreen canvas at the crop dimensions
2. Fill with white background
3. `drawImage()` from the PDF canvas (if available) clipped to the crop region
4. `drawImage()` from the committed strokes canvas clipped to the crop region
5. `canvas.toDataURL('image/png')` for the result

**Trade-off**: This captures PDF background + strokes but not DOM-rendered text boxes. For the "screenshot to AI" use case, this is acceptable since users primarily screenshot drawings, diagrams, and handwritten content. Text content can be sent via the "Select Text" option instead.

## Files to Modify

1. **`src/components/canvas/canvas-editor.tsx`** — Rewrite `handleAskAiWithRegion` to use canvas compositing instead of `html-to-image`
