import { getStroke } from 'perfect-freehand';

import type { Stroke, StrokePoint, BBox } from '@/types/canvas';

/**
 * Converts perfect-freehand output points into an SVG path data string
 * using quadratic Bezier curves.
 */
export function getSvgPathFromStroke(
  points: number[][],
  closed = true,
): string {
  const len = points.length;
  if (len < 4) return '';

  let a = points[0],
    b = points[1];
  const c = points[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${((b[0] + c[0]) / 2).toFixed(2)},${((b[1] + c[1]) / 2).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)} `;
  }

  if (closed) result += 'Z';
  return result;
}

/**
 * Takes raw input points, runs them through perfect-freehand's getStroke,
 * converts the result to an SVG path, creates a Path2D, and fills it
 * onto the given canvas context.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  inputPoints: StrokePoint[],
  options?: { color?: string; size?: number; opacity?: number },
): void {
  const color = options?.color ?? '#000000';
  const size = options?.size ?? 3;
  const opacity = options?.opacity ?? 1;

  const outlinePoints = getStroke(inputPoints, {
    size,
    simulatePressure: false,
  });

  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return;

  const path = new Path2D(pathData);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.globalAlpha = 1;
}

/**
 * Iterates through points to compute an axis-aligned bounding box.
 */
export function computeBBox(points: StrokePoint[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Returns the minimum distance from point (px, py) to the line segment
 * defined by endpoints (ax, ay) and (bx, by).
 *
 * Uses the standard projection formula: project the point onto the infinite
 * line through A-B, clamp the parameter t to [0, 1] to stay within the
 * segment, then compute the Euclidean distance to the clamped projection.
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  // Degenerate segment (A and B are the same point)
  if (lengthSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // Parameter t is the scalar projection of AP onto AB, normalised by |AB|².
  // Clamping to [0, 1] restricts the closest point to lie on the segment.
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq),
  );

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;

  const ex = px - closestX;
  const ey = py - closestY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Checks whether an eraser circle (centred at eraserX, eraserY with the
 * given eraserRadius) hits the supplied stroke.
 *
 * Two-phase approach for performance:
 *  1. Broad-phase — AABB overlap test between the eraser circle (expanded
 *     by the stroke's half-width) and the stroke's precomputed bounding box.
 *     Allows an early return when the eraser is nowhere near the stroke.
 *  2. Narrow-phase — iterate through consecutive point pairs in the stroke
 *     and check the perpendicular distance from the eraser centre to each
 *     segment against the combined tolerance (eraserRadius + half stroke width).
 */
export function isStrokeHit(
  stroke: Stroke,
  eraserX: number,
  eraserY: number,
  eraserRadius: number,
): boolean {
  const halfWidth = stroke.width / 2;
  const reach = eraserRadius + halfWidth;

  // --- Broad-phase: AABB overlap ---
  const { minX, minY, maxX, maxY } = stroke.bbox;
  if (
    eraserX + reach < minX ||
    eraserX - reach > maxX ||
    eraserY + reach < minY ||
    eraserY - reach > maxY
  ) {
    return false;
  }

  // --- Narrow-phase: per-segment distance check ---
  const { points } = stroke;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];

    if (pointToSegmentDistance(eraserX, eraserY, ax, ay, bx, by) < reach) {
      return true;
    }
  }

  return false;
}

/**
 * Ray-casting algorithm to determine whether a point lies inside a polygon.
 *
 * Casts a horizontal ray from (px, py) to +Infinity and counts how many
 * edges of the polygon the ray crosses. An odd number of crossings means
 * the point is inside; even means outside.
 */
export function pointInPolygon(
  px: number,
  py: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  const len = polygon.length;

  for (let i = 0, j = len - 1; i < len; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];

    // Check if the ray crosses this edge.
    // The edge must straddle the ray's y-coordinate, and the intersection
    // x-coordinate must be to the right of px.
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Simple axis-aligned bounding box intersection test.
 *
 * Two AABBs overlap if and only if they overlap on both axes. They do NOT
 * overlap when one is entirely to the left, right, above, or below the other.
 */
export function aabbIntersectsRect(
  bbox: BBox,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    bbox.maxX >= rect.minX &&
    bbox.minX <= rect.maxX &&
    bbox.maxY >= rect.minY &&
    bbox.minY <= rect.maxY
  );
}

/**
 * Determines whether any point of a stroke falls inside the given selection
 * polygon.
 *
 * Two-phase approach for performance:
 *  1. Broad-phase — compute the polygon's AABB and test it against the
 *     stroke's precomputed AABB. If they don't intersect the stroke can't
 *     possibly be inside the selection, so we return early.
 *  2. Narrow-phase — iterate through the stroke's points and run the
 *     ray-casting point-in-polygon test on each one. Return true as soon as
 *     any point is found inside.
 */
export function isStrokeInSelection(
  stroke: Stroke,
  polygon: [number, number][],
): boolean {
  if (polygon.length < 3) return false;

  // Broad-phase: compute polygon AABB
  let polyMinX = Infinity;
  let polyMinY = Infinity;
  let polyMaxX = -Infinity;
  let polyMaxY = -Infinity;

  for (const [x, y] of polygon) {
    if (x < polyMinX) polyMinX = x;
    if (y < polyMinY) polyMinY = y;
    if (x > polyMaxX) polyMaxX = x;
    if (y > polyMaxY) polyMaxY = y;
  }

  if (
    !aabbIntersectsRect(stroke.bbox, {
      minX: polyMinX,
      minY: polyMinY,
      maxX: polyMaxX,
      maxY: polyMaxY,
    })
  ) {
    return false;
  }

  // Narrow-phase: check each stroke point against the polygon
  for (const [x, y] of stroke.points) {
    if (pointInPolygon(x, y, polygon)) return true;
  }

  return false;
}

/**
 * Computes the union bounding box that encompasses all provided strokes.
 *
 * Returns null when the input array is empty, since there is no meaningful
 * bounding box to produce.
 */
export function getSelectionBBox(strokes: Stroke[]): BBox | null {
  if (strokes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const b = stroke.bbox;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return { minX, minY, maxX, maxY };
}
