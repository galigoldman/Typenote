'use client';

import { useCallback, type RefObject } from 'react';

const MIN_REGION_SIZE = 20;

interface UseRegionCaptureOptions {
  pdfCanvasRef: RefObject<HTMLCanvasElement | null>;
  strokesCanvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Captures a region of the canvas (PDF background + strokes) as a PNG data URL.
 * Uses the Canvas 2D API drawImage with cropping to extract the selected area.
 */
export function useRegionCapture({
  pdfCanvasRef,
  strokesCanvasRef,
}: UseRegionCaptureOptions) {
  const captureRegion = useCallback(
    (rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): string | null => {
      // Enforce minimum region size
      if (rect.width < MIN_REGION_SIZE || rect.height < MIN_REGION_SIZE) {
        return null;
      }

      const pdfCanvas = pdfCanvasRef.current;
      const strokesCanvas = strokesCanvasRef.current;
      if (!pdfCanvas && !strokesCanvas) return null;

      const dpr = window.devicePixelRatio || 1;

      // Create offscreen canvas at the region size (scaled for DPI)
      const offscreen = window.document.createElement('canvas');
      const outW = Math.round(rect.width * dpr);
      const outH = Math.round(rect.height * dpr);
      offscreen.width = outW;
      offscreen.height = outH;

      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      // Source coordinates in the high-DPI backing store
      const sx = Math.round(rect.x * dpr);
      const sy = Math.round(rect.y * dpr);
      const sw = outW;
      const sh = outH;

      // Draw PDF background canvas region
      if (pdfCanvas) {
        ctx.drawImage(pdfCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
      }

      // Composite strokes canvas on top
      if (strokesCanvas) {
        ctx.drawImage(strokesCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
      }

      return offscreen.toDataURL('image/png');
    },
    [pdfCanvasRef, strokesCanvasRef],
  );

  return { captureRegion };
}
