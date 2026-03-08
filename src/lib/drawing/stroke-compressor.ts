import type { Point, Stroke } from './types';

/**
 * Calculate the perpendicular distance from a point to the line
 * defined by lineStart and lineEnd.
 *
 * Uses the standard formula:
 *   distance = |((y2-y1)*px - (x2-x1)*py + x2*y1 - y2*x1)| / sqrt((y2-y1)² + (x2-x1)²)
 *
 * We only use x,y coordinates (indices 0,1) — pressure is carried along
 * but does not affect geometric distance.
 */
function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];

  // If start and end are the same point, return Euclidean distance to that point
  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq === 0) {
    const px = point[0] - lineStart[0];
    const py = point[1] - lineStart[1];
    return Math.sqrt(px * px + py * py);
  }

  // Standard perpendicular distance formula
  const numerator = Math.abs(
    dy * point[0] -
      dx * point[1] +
      lineEnd[0] * lineStart[1] -
      lineEnd[1] * lineStart[0],
  );
  const denominator = Math.sqrt(lineLengthSq);
  return numerator / denominator;
}

/**
 * Ramer-Douglas-Peucker algorithm for polyline simplification.
 *
 * Reduces the number of points in a stroke while preserving its overall shape.
 * Points whose perpendicular distance to the simplified line is below `tolerance`
 * are discarded. Pressure values are preserved on every kept point.
 *
 * @param points  - The original array of sampled points
 * @param tolerance - Maximum allowed perpendicular distance (pixels). Default: 1.0
 * @returns A new array with fewer (or equal) points
 */
export function simplifyPoints(
  points: Point[],
  tolerance: number = 1.0,
): Point[] {
  if (points.length <= 2) {
    return points.slice();
  }

  const first = points[0];
  const last = points[points.length - 1];

  // Find the point with the maximum distance from the line (first → last)
  let maxDistance = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If the farthest point exceeds the tolerance, recursively simplify both halves
  if (maxDistance > tolerance) {
    const left = simplifyPoints(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPoints(points.slice(maxIndex), tolerance);

    // Concatenate, removing duplicate pivot point
    return left.slice(0, -1).concat(right);
  }

  // All intermediate points are within tolerance — discard them
  return [first, last];
}

/**
 * Round every coordinate in a Point to the specified number of decimal places.
 *
 * Reducing decimal precision shrinks serialized size (e.g. JSON or IndexedDB storage)
 * without visible quality loss at typical screen resolutions.
 *
 * @param point    - The point to round
 * @param decimals - Number of decimal places. Default: 1
 * @returns A new Point with rounded values
 */
export function roundPoint(point: Point, decimals: number = 1): Point {
  const factor = Math.pow(10, decimals);
  return [
    Math.round(point[0] * factor) / factor,
    Math.round(point[1] * factor) / factor,
    Math.round(point[2] * factor) / factor,
  ];
}

/**
 * Compress a single stroke by simplifying its point array and rounding coordinates.
 *
 * Returns a new Stroke object — the original is not mutated.
 * Non-geometric fields (id, color, width, tool) are preserved as-is.
 */
export function compressStroke(stroke: Stroke): Stroke {
  const simplified = simplifyPoints(stroke.points);
  const rounded = simplified.map((p) => roundPoint(p));

  return {
    ...stroke,
    points: rounded,
  };
}

/**
 * Compress an array of strokes.
 *
 * Convenience wrapper that applies `compressStroke` to every stroke.
 */
export function compressStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map(compressStroke);
}
