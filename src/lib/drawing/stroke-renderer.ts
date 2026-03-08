import getStroke from 'perfect-freehand';
import type { Stroke } from './types';

/**
 * Converts the outline points returned by perfect-freehand into an SVG path
 * data string.  Uses the average of consecutive points as control / end points
 * for quadratic Bézier curves, which produces noticeably smoother strokes than
 * simple line segments.
 */
export function getSvgPathFromStroke(stroke: Stroke): string {
  const outlinePoints = getStroke(stroke.points, {
    size: stroke.width * 3,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  });

  if (outlinePoints.length === 0) return '';

  // With fewer than 3 outline points we can't build a meaningful curve.
  if (outlinePoints.length < 3) {
    const [x, y] = outlinePoints[0];
    return `M ${x} ${y} L ${x} ${y} Z`;
  }

  // Start from the average of the first and last points so the path closes
  // smoothly.
  const first = outlinePoints[0];
  const last = outlinePoints[outlinePoints.length - 1];

  const d: string[] = [
    `M ${(first[0] + last[0]) / 2} ${(first[1] + last[1]) / 2}`,
  ];

  for (let i = 0; i < outlinePoints.length; i++) {
    const current = outlinePoints[i];
    const next = outlinePoints[(i + 1) % outlinePoints.length];

    d.push(
      `Q ${current[0]} ${current[1]} ${(current[0] + next[0]) / 2} ${(current[1] + next[1]) / 2}`,
    );
  }

  d.push('Z');

  return d.join(' ');
}

/**
 * Renders a single stroke onto a 2D canvas context.
 *
 * For eraser strokes the composite operation is temporarily switched to
 * `destination-out` so existing pixels are removed instead of painted.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  const pathString = getSvgPathFromStroke(stroke);
  if (!pathString) return;

  const path = new Path2D(pathString);

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  }

  ctx.fillStyle = stroke.color;
  ctx.fill(path);

  // Always reset to the default composite operation so subsequent draws are
  // not affected.
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Clears the entire canvas and re-renders every stroke in order.
 *
 * This "full redraw" approach is the simplest correct strategy: because
 * eraser strokes depend on the composite state of everything drawn before
 * them, selectively updating a single stroke would require tracking layer
 * dependencies.  For the typical number of strokes in a hand-drawn note
 * block this is plenty fast.
 */
export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const stroke of strokes) {
    renderStroke(ctx, stroke);
  }
}
