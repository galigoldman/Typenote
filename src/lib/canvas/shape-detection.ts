import { getStroke } from 'perfect-freehand';

import type { StrokePoint } from '@/types/canvas';

import { getSvgPathFromStroke } from '@/lib/canvas/stroke-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShapeType = 'circle' | 'rectangle' | 'triangle';

export interface ShapeDetectionResult {
  type: ShapeType;
  confidence: number;
  /** Circle params */
  center?: { x: number; y: number };
  radius?: number;
  /** Rectangle params (4 corners, clockwise from top-left) */
  corners?: { x: number; y: number }[];
  /** Average pressure from the original stroke */
  pressure: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** Minimum bounding-box diagonal (in px) for a stroke to be considered a shape. */
const MIN_BBOX_DIAGONAL = 30;

/** Minimum confidence score required to accept a shape detection. */
const CONFIDENCE_THRESHOLD = 0.3;

/**
 * Computes the mean pressure across all points.
 */
function meanPressure(points: StrokePoint[]): number {
  if (points.length === 0) return 0.5;
  let sum = 0;
  for (const p of points) sum += p[2];
  return sum / points.length;
}

/**
 * Returns the bounding-box diagonal length for a set of points.
 */
function bboxDiagonal(points: StrokePoint[]): number {
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
  const dx = maxX - minX;
  const dy = maxY - minY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalises an angle in degrees to the range [0, 360).
 */
function normaliseDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Computes the shortest signed angular difference between two angles
 * (both in degrees). Result is in the range (-180, 180].
 */
function angleDiffDeg(a: number, b: number): number {
  let d = ((b - a) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

// ---------------------------------------------------------------------------
// 1. computeCentroid
// ---------------------------------------------------------------------------

/**
 * Returns the arithmetic mean of all (x, y) positions in the stroke.
 */
export function computeCentroid(points: StrokePoint[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  const n = points.length || 1;
  return { x: sx / n, y: sy / n };
}

// ---------------------------------------------------------------------------
// 2. smoothPoints
// ---------------------------------------------------------------------------

/**
 * Applies a simple moving-average filter over the point coordinates.
 * Pressure is averaged over the same window. The window is centred on each
 * point and clamped at the edges of the array.
 */
export function smoothPoints(
  points: StrokePoint[],
  windowSize = 5,
): StrokePoint[] {
  const n = points.length;
  if (n === 0) return [];
  const half = Math.floor(windowSize / 2);
  const result: StrokePoint[] = [];

  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let sp = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      sx += points[j][0];
      sy += points[j][1];
      sp += points[j][2];
      count++;
    }
    result.push([sx / count, sy / count, sp / count]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. detectCorners
// ---------------------------------------------------------------------------

/**
 * Walks along the points and detects sharp direction changes. A corner is
 * registered whenever the cumulative angle change since the last corner (or
 * the start) exceeds `angleThreshold` degrees.
 *
 * Returns an array of indices into `points` where corners occur.
 */
export function detectCorners(
  points: StrokePoint[],
  angleThreshold = 60,
): number[] {
  const n = points.length;
  if (n < 3) return [];

  const corners: number[] = [];

  // Compute segment directions
  const directions: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    directions.push(Math.atan2(dy, dx) * RAD_TO_DEG);
  }

  let cumulativeAngle = 0;
  let lastCornerIdx = 0;

  for (let i = 1; i < directions.length; i++) {
    const diff = angleDiffDeg(directions[i - 1], directions[i]);
    cumulativeAngle += diff;

    if (Math.abs(cumulativeAngle) >= angleThreshold) {
      // Place the corner at the midpoint of the accumulated range
      const cornerIdx = Math.round((lastCornerIdx + i) / 2);
      // Avoid duplicate indices and edge indices (first/last)
      if (
        cornerIdx > 0 &&
        cornerIdx < n - 1 &&
        (corners.length === 0 || corners[corners.length - 1] !== cornerIdx)
      ) {
        corners.push(cornerIdx);
      }
      cumulativeAngle = 0;
      lastCornerIdx = i;
    }
  }

  return corners;
}

// ---------------------------------------------------------------------------
// 4. computeAngularCoverage
// ---------------------------------------------------------------------------

/**
 * Computes how many degrees of arc the stroke covers when viewed from the
 * given centre. Returns a value in the range [0, 360].
 */
export function computeAngularCoverage(
  points: StrokePoint[],
  center: { x: number; y: number },
): number {
  if (points.length < 2) return 0;

  // Compute angle of each point relative to centre
  const angles: number[] = points.map(([x, y]) =>
    normaliseDeg(Math.atan2(y - center.y, x - center.x) * RAD_TO_DEG),
  );

  // Walk through the angles and accumulate total absolute angular traversal,
  // but what we really want is the total arc that is *covered*.
  // We use a sorted unique-angle bucket approach: discretise angles into 1°
  // bins, count the number of distinct bins hit, and that is our coverage.
  const buckets = new Set<number>();
  for (const a of angles) {
    buckets.add(Math.round(a) % 360);
  }

  // Also fill in between consecutive points to avoid gaps from sparse sampling
  for (let i = 0; i < angles.length - 1; i++) {
    const diff = angleDiffDeg(angles[i], angles[i + 1]);
    const steps = Math.min(Math.abs(Math.round(diff)), 360);
    const dir = diff >= 0 ? 1 : -1;
    let cur = Math.round(angles[i]);
    for (let s = 0; s <= steps; s++) {
      buckets.add(((cur % 360) + 360) % 360);
      cur += dir;
    }
  }

  return Math.min(buckets.size, 360);
}

// ---------------------------------------------------------------------------
// Edge straightness helper
// ---------------------------------------------------------------------------

/**
 * For a sub-sequence of points between two corner indices, computes the
 * maximum perpendicular distance of any point to the straight line connecting
 * the two endpoints, divided by the length of that line.
 *
 * Returns a value ≥ 0 where 0 is perfectly straight. Lower is straighter.
 */
function edgeStraightness(
  points: StrokePoint[],
  startIdx: number,
  endIdx: number,
): number {
  const ax = points[startIdx][0];
  const ay = points[startIdx][1];
  const bx = points[endIdx][0];
  const by = points[endIdx][1];

  const edgeDx = bx - ax;
  const edgeDy = by - ay;
  const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
  if (edgeLen < 1e-6) return 0;

  let maxDist = 0;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const px = points[i][0];
    const py = points[i][1];
    // Perpendicular distance from point to line through A-B
    const dist =
      Math.abs(edgeDy * (px - ax) - edgeDx * (py - ay)) / edgeLen;
    if (dist > maxDist) maxDist = dist;
  }

  return maxDist / edgeLen;
}

/**
 * Computes the angle at a corner given three points (prev → corner → next).
 * Returns the interior angle in degrees.
 */
function cornerAngle(
  prev: StrokePoint,
  corner: StrokePoint,
  next: StrokePoint,
): number {
  const dx1 = prev[0] - corner[0];
  const dy1 = prev[1] - corner[1];
  const dx2 = next[0] - corner[0];
  const dy2 = next[1] - corner[1];

  const dot = dx1 * dx2 + dy1 * dy2;
  const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

  if (mag1 < 1e-6 || mag2 < 1e-6) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle) * RAD_TO_DEG;
}

// ---------------------------------------------------------------------------
// 5. detectCircle
// ---------------------------------------------------------------------------

export function detectCircle(points: StrokePoint[]): ShapeDetectionResult | null {
  if (points.length < 6) return null;

  // Check minimum size
  if (bboxDiagonal(points) < MIN_BBOX_DIAGONAL) return null;

  const center = computeCentroid(points);

  // Compute distances from centroid
  const distances: number[] = points.map(([x, y]) => {
    const dx = x - center.x;
    const dy = y - center.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  const meanDist =
    distances.reduce((sum, d) => sum + d, 0) / distances.length;

  if (meanDist < 1e-6) return null;

  const variance =
    distances.reduce((sum, d) => sum + (d - meanDist) ** 2, 0) /
    distances.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / meanDist; // coefficient of variation

  // GoodNotes-style: very forgiving — real freehand circles are messy.
  // CV up to 0.45 still looks intentionally circular.
  if (cv > 0.45) return null;

  // Check angular coverage — 180° minimum (even half-circles should snap)
  const coverage = computeAngularCoverage(points, center);
  if (coverage < 180) return null;

  // Also check aspect ratio of bounding box — reject very elongated shapes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const aspect = bboxW > bboxH ? bboxW / bboxH : bboxH / bboxW;
  // Reject if aspect ratio > 2.5 (too elongated to be a circle)
  if (aspect > 2.5) return null;

  // Score: lower CV and higher coverage = better circle
  let score = 1 - cv * 1.5; // scale CV impact (0.45 → score ~0.325)
  if (coverage < 360) {
    // Gentle penalty for incomplete coverage
    score *= 0.5 + 0.5 * (coverage / 360);
  }

  return {
    type: 'circle',
    confidence: Math.max(0, Math.min(1, score)),
    center,
    radius: meanDist,
    pressure: meanPressure(points),
  };
}

// ---------------------------------------------------------------------------
// 6. detectRectangle
// ---------------------------------------------------------------------------

/**
 * Orders 4 corners in clockwise order starting from the top-left.
 */
function orderCornersClockwise(
  corners: { x: number; y: number }[],
): { x: number; y: number }[] {
  // Compute centroid of the corners
  let cx = 0;
  let cy = 0;
  for (const c of corners) {
    cx += c.x;
    cy += c.y;
  }
  cx /= corners.length;
  cy /= corners.length;

  // Sort by angle from centroid (clockwise, starting from top-left = ~-135°)
  const sorted = [...corners].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  // Rotate so that the top-left corner (smallest x+y) is first
  let topLeftIdx = 0;
  let minSum = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i].x + sorted[i].y;
    if (s < minSum) {
      minSum = s;
      topLeftIdx = i;
    }
  }

  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[(topLeftIdx + i) % sorted.length]);
  }

  return result;
}

export function detectRectangle(
  points: StrokePoint[],
): ShapeDetectionResult | null {
  if (points.length < 12) return null;

  const smoothed = smoothPoints(points, 5);
  const cornerIndices = detectCorners(smoothed, 60);

  if (cornerIndices.length !== 4) return null;

  // Check each corner angle is approximately 90° (±30°)
  let angleScore = 0;
  const edgeIndices = [0, ...cornerIndices, smoothed.length - 1];

  for (let i = 0; i < 4; i++) {
    const cIdx = cornerIndices[i];
    const prevIdx =
      i === 0
        ? 0
        : cornerIndices[i - 1];
    const nextIdx =
      i === 3
        ? smoothed.length - 1
        : cornerIndices[i + 1];

    const angle = cornerAngle(smoothed[prevIdx], smoothed[cIdx], smoothed[nextIdx]);
    const deviation = Math.abs(angle - 90);

    if (deviation > 30) return null;

    // Score: closer to 90° → higher score
    angleScore += 1 - deviation / 90;
  }
  angleScore /= 4;

  // Check edge straightness between consecutive corners (including
  // start→first corner and last corner→end)
  let straightnessScore = 0;
  for (let i = 0; i < edgeIndices.length - 1; i++) {
    const s = edgeStraightness(smoothed, edgeIndices[i], edgeIndices[i + 1]);
    straightnessScore += Math.max(0, 1 - s * 5); // penalise deviation
  }
  straightnessScore /= edgeIndices.length - 1;

  const confidence = angleScore * 0.6 + straightnessScore * 0.4;

  // Build corner points
  let corners = cornerIndices.map((idx) => ({
    x: smoothed[idx][0],
    y: smoothed[idx][1],
  }));

  corners = orderCornersClockwise(corners);

  // If aspect ratio is close to 1, snap to square
  const widthTop = Math.sqrt(
    (corners[1].x - corners[0].x) ** 2 + (corners[1].y - corners[0].y) ** 2,
  );
  const heightLeft = Math.sqrt(
    (corners[3].x - corners[0].x) ** 2 + (corners[3].y - corners[0].y) ** 2,
  );

  if (heightLeft > 1e-6) {
    const aspect = widthTop / heightLeft;
    if (aspect >= 0.8 && aspect <= 1.2) {
      // Snap to square: use the average side length
      const cx =
        (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
      const cy =
        (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      const side = (widthTop + heightLeft) / 2;
      const half = side / 2;
      corners = [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
      ];
    }
  }

  return {
    type: 'rectangle',
    confidence: Math.max(0, Math.min(1, confidence)),
    corners,
    pressure: meanPressure(points),
  };
}

// ---------------------------------------------------------------------------
// 7. detectTriangle
// ---------------------------------------------------------------------------

export function detectTriangle(
  points: StrokePoint[],
): ShapeDetectionResult | null {
  if (points.length < 9) return null;

  const smoothed = smoothPoints(points, 5);
  const cornerIndices = detectCorners(smoothed, 60);

  if (cornerIndices.length !== 3) return null;

  // Check edge straightness
  const edgeIndices = [0, ...cornerIndices, smoothed.length - 1];
  let straightnessScore = 0;
  for (let i = 0; i < edgeIndices.length - 1; i++) {
    const s = edgeStraightness(smoothed, edgeIndices[i], edgeIndices[i + 1]);
    straightnessScore += Math.max(0, 1 - s * 5);
  }
  straightnessScore /= edgeIndices.length - 1;

  // Corner distinctness: corners should be well-separated along the stroke
  let distinctness = 1;
  const totalLen = smoothed.length;
  for (let i = 0; i < cornerIndices.length; i++) {
    const next =
      i < cornerIndices.length - 1 ? cornerIndices[i + 1] : totalLen - 1;
    const gap = next - cornerIndices[i];
    // Penalise if any segment is very short relative to total length
    const ratio = gap / totalLen;
    if (ratio < 0.05) distinctness *= 0.5;
  }

  const confidence = straightnessScore * 0.7 + distinctness * 0.3;

  const corners = cornerIndices.map((idx) => ({
    x: smoothed[idx][0],
    y: smoothed[idx][1],
  }));

  return {
    type: 'triangle',
    confidence: Math.max(0, Math.min(1, confidence)),
    corners,
    pressure: meanPressure(points),
  };
}

// ---------------------------------------------------------------------------
// 8. classifyShape
// ---------------------------------------------------------------------------

/**
 * Runs all three shape detectors against the input points and returns the
 * highest-scoring result that exceeds the confidence threshold. On ties,
 * priority order is circle > rectangle > triangle.
 *
 * Returns null if no shape is detected with sufficient confidence.
 */
export function classifyShape(
  points: StrokePoint[],
): ShapeDetectionResult | null {
  if (points.length < 3) return null;

  // Check minimum size
  if (bboxDiagonal(points) < MIN_BBOX_DIAGONAL) return null;

  const candidates: ShapeDetectionResult[] = [];

  const circle = detectCircle(points);
  if (circle && circle.confidence >= CONFIDENCE_THRESHOLD) {
    candidates.push(circle);
  }

  const rectangle = detectRectangle(points);
  if (rectangle && rectangle.confidence >= CONFIDENCE_THRESHOLD) {
    candidates.push(rectangle);
  }

  const triangle = detectTriangle(points);
  if (triangle && triangle.confidence >= CONFIDENCE_THRESHOLD) {
    candidates.push(triangle);
  }

  if (candidates.length === 0) return null;

  // Sort by confidence descending. On ties, use priority order.
  const priority: Record<ShapeType, number> = {
    circle: 0,
    rectangle: 1,
    triangle: 2,
  };

  candidates.sort((a, b) => {
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 1e-9) return confDiff;
    return priority[a.type] - priority[b.type];
  });

  return candidates[0];
}

// ---------------------------------------------------------------------------
// 9. generateShapePoints
// ---------------------------------------------------------------------------

/**
 * Generates an array of StrokePoints describing the detected shape.
 * The returned loop is closed (last point coincides with the first) so that
 * perfect-freehand renders a continuous outline.
 */
export function generateShapePoints(
  result: ShapeDetectionResult,
): StrokePoint[] {
  const p = result.pressure;

  switch (result.type) {
    case 'circle': {
      const { center, radius } = result;
      if (!center || radius == null) return [];

      const numPoints = 64;
      const pts: StrokePoint[] = [];
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        pts.push([
          center.x + radius * Math.cos(angle),
          center.y + radius * Math.sin(angle),
          p,
        ]);
      }
      return pts;
    }

    case 'rectangle': {
      const { corners } = result;
      if (!corners || corners.length !== 4) return [];

      const pointsPerEdge = 8;
      const pts: StrokePoint[] = [];

      for (let e = 0; e < 4; e++) {
        const start = corners[e];
        const end = corners[(e + 1) % 4];

        // Corner point
        pts.push([start.x, start.y, p]);

        // Intermediate points along the edge
        for (let i = 1; i <= pointsPerEdge; i++) {
          const t = i / (pointsPerEdge + 1);
          pts.push([
            start.x + (end.x - start.x) * t,
            start.y + (end.y - start.y) * t,
            p,
          ]);
        }
      }

      // Close the loop by returning to the first corner
      pts.push([corners[0].x, corners[0].y, p]);

      return pts;
    }

    case 'triangle': {
      const { corners } = result;
      if (!corners || corners.length !== 3) return [];

      const pointsPerEdge = 8;
      const pts: StrokePoint[] = [];

      for (let e = 0; e < 3; e++) {
        const start = corners[e];
        const end = corners[(e + 1) % 3];

        // Corner point
        pts.push([start.x, start.y, p]);

        // Intermediate points along the edge
        for (let i = 1; i <= pointsPerEdge; i++) {
          const t = i / (pointsPerEdge + 1);
          pts.push([
            start.x + (end.x - start.x) * t,
            start.y + (end.y - start.y) * t,
            p,
          ]);
        }
      }

      // Close the loop by returning to the first corner
      pts.push([corners[0].x, corners[0].y, p]);

      return pts;
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// 10. renderSnappedShape
// ---------------------------------------------------------------------------

/**
 * Renders a detected shape onto a canvas element. Clears the canvas first,
 * generates the ideal shape points, runs them through perfect-freehand's
 * getStroke, converts to an SVG path, and fills it.
 */
export function renderSnappedShape(
  canvas: HTMLCanvasElement,
  result: ShapeDetectionResult,
  options: { size: number; color: string; opacity: number },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear the working canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Generate ideal shape points
  const shapePoints = generateShapePoints(result);
  if (shapePoints.length === 0) return;

  // Run through perfect-freehand
  const outlinePoints = getStroke(shapePoints, {
    size: options.size,
    simulatePressure: false,
  });

  // Convert to SVG path and render
  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return;

  const path = new Path2D(pathData);
  ctx.globalAlpha = options.opacity;
  ctx.fillStyle = options.color;
  ctx.fill(path);
  ctx.globalAlpha = 1;
}
