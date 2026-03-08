import type { Viewport, ElementMap, CanvasElement } from '@/lib/canvas/types';

/** Axis-aligned bounding box representing the visible area in canvas coordinates */
export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Default margin (in canvas-coordinate pixels) for pre-rendering elements just outside the viewport */
const DEFAULT_MARGIN = 100;

/**
 * Convert viewport pan/zoom + container size into a bounding box in canvas coordinates.
 *
 * The viewport's (x, y) represent the CSS translation applied to the canvas layer,
 * so the top-left corner of the visible area in canvas space is (-x / zoom)
 * and the visible span along each axis is (containerSize / zoom).
 */
export function getViewportBounds(
  viewport: Viewport,
  containerWidth: number,
  containerHeight: number
): ViewportBounds {
  const left = -viewport.x / viewport.zoom;
  const top = -viewport.y / viewport.zoom;
  const right = left + containerWidth / viewport.zoom;
  const bottom = top + containerHeight / viewport.zoom;

  return { left, top, right, bottom };
}

/**
 * Check whether a single canvas element intersects the (optionally padded) viewport bounds.
 *
 * Uses standard AABB (axis-aligned bounding box) overlap detection:
 * two rectangles do NOT overlap when one is entirely to the left, right,
 * above, or below the other.  We negate that condition to get overlap.
 *
 * @param element - The canvas element to test.
 * @param bounds  - The viewport bounds in canvas coordinates.
 * @param margin  - Extra padding added around the viewport so elements are
 *                  pre-rendered slightly before scrolling into view (default 100px).
 */
export function isElementVisible(
  element: CanvasElement,
  bounds: ViewportBounds,
  margin: number = DEFAULT_MARGIN
): boolean {
  const paddedLeft = bounds.left - margin;
  const paddedTop = bounds.top - margin;
  const paddedRight = bounds.right + margin;
  const paddedBottom = bounds.bottom + margin;

  const elRight = element.x + element.width;
  const elBottom = element.y + element.height;

  // No overlap when one rect is completely outside the other
  if (elRight < paddedLeft) return false;
  if (element.x > paddedRight) return false;
  if (elBottom < paddedTop) return false;
  if (element.y > paddedBottom) return false;

  return true;
}

/**
 * Return the IDs of every element currently visible in the viewport.
 *
 * This is the main entry point consumers should use. It combines
 * `getViewportBounds` and `isElementVisible` into a single call.
 *
 * @param elements        - The full element map (id -> CanvasElement).
 * @param viewport        - Current pan/zoom state.
 * @param containerWidth  - Width of the viewport container in CSS pixels.
 * @param containerHeight - Height of the viewport container in CSS pixels.
 * @param margin          - Pre-render margin in canvas-coordinate pixels (default 100).
 */
export function getVisibleElementIds(
  elements: ElementMap,
  viewport: Viewport,
  containerWidth: number,
  containerHeight: number,
  margin: number = DEFAULT_MARGIN
): string[] {
  const bounds = getViewportBounds(viewport, containerWidth, containerHeight);

  const visibleIds: string[] = [];

  for (const id of Object.keys(elements)) {
    if (isElementVisible(elements[id], bounds, margin)) {
      visibleIds.push(id);
    }
  }

  return visibleIds;
}
