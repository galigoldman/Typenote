import { getStroke } from 'perfect-freehand';

import type { StrokePoint, BBox } from '@/types/canvas';

/**
 * Converts perfect-freehand output points into an SVG path data string
 * using quadratic Bezier curves.
 */
export function getSvgPathFromStroke(points: number[][], closed = true): string {
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
  options?: { color?: string; size?: number },
): void {
  const color = options?.color ?? '#000000';
  const size = options?.size ?? 3;

  const outlinePoints = getStroke(inputPoints, {
    size,
    simulatePressure: false,
  });

  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return;

  const path = new Path2D(pathData);
  ctx.fillStyle = color;
  ctx.fill(path);
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
