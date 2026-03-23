import { getStroke } from 'perfect-freehand';
import type { Stroke } from '@/types/canvas';

/**
 * Convert a canvas Stroke into an SVG `<path>` element string.
 * Uses perfect-freehand to compute the outline polygon, then
 * encodes it as an SVG path with fill color and opacity.
 *
 * Returns an empty string if the stroke has fewer than 2 points.
 */
export function strokeToSvgPath(stroke: Stroke): string {
  const outline = getStroke(stroke.points, {
    size: stroke.width,
    simulatePressure: false,
  });

  if (outline.length < 3) return '';

  // Build SVG path data: M start, L to each point, Z close
  const d = [
    `M ${outline[0][0]} ${outline[0][1]}`,
    ...outline.slice(1).map(([x, y]) => `L ${x} ${y}`),
    'Z',
  ].join(' ');

  const opacity =
    stroke.opacity < 1 ? ` fill-opacity="${stroke.opacity}"` : '';

  return `<path d="${d}" fill="${stroke.color}"${opacity} stroke="none"/>`;
}
