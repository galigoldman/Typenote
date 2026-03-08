import type { ViewTransform } from '@/types/canvas';

/**
 * Converts screen (pixel) coordinates to page (logical) coordinates
 * by reversing the view transform: first subtract the pan offset,
 * then divide by the zoom scale.
 */
export function screenToPage(
  screenX: number,
  screenY: number,
  viewTransform: ViewTransform
): { x: number; y: number } {
  const { scale, offsetX, offsetY } = viewTransform;
  return {
    x: (screenX - offsetX) / scale,
    y: (screenY - offsetY) / scale,
  };
}

/**
 * Converts page (logical) coordinates to screen (pixel) coordinates
 * by applying the view transform: first multiply by the zoom scale,
 * then add the pan offset.
 */
export function pageToScreen(
  pageX: number,
  pageY: number,
  viewTransform: ViewTransform
): { x: number; y: number } {
  const { scale, offsetX, offsetY } = viewTransform;
  return {
    x: pageX * scale + offsetX,
    y: pageY * scale + offsetY,
  };
}

/**
 * Configures a <canvas> element for high-DPI (Retina) displays.
 *
 * On a 2x display the browser allocates 2 physical pixels per CSS pixel.
 * Without correction the canvas renders at 1x and the browser stretches it,
 * producing blurry output.  This function:
 *   1. Scales the backing buffer to match the physical pixel count.
 *   2. Keeps the CSS size unchanged so the element occupies the expected space.
 *   3. Applies a uniform ctx.scale so draw calls can continue to use
 *      CSS-pixel coordinates.
 *
 * Returns the 2D rendering context (already scaled) or null if unavailable.
 */
export function setupHighDPICanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  return ctx;
}
