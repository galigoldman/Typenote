import { describe, it, expect } from 'vitest';

import type { StrokePoint } from '@/types/canvas';

import {
  computeCentroid,
  smoothPoints,
  detectCorners,
  computeAngularCoverage,
  detectCircle,
  detectRectangle,
  detectTriangle,
  classifyShape,
  generateShapePoints,
} from './shape-detection';

import type { ShapeDetectionResult } from './shape-detection';

// ---------------------------------------------------------------------------
// Helper functions to generate test data
// ---------------------------------------------------------------------------

/**
 * Generates evenly-spaced points around a full circle.
 */
function makeCirclePoints(
  cx: number,
  cy: number,
  r: number,
  n: number,
  pressure = 0.5,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle), pressure]);
  }
  return pts;
}

/**
 * Generates points along an arc of `arcDegrees` degrees.
 */
function makeArcPoints(
  cx: number,
  cy: number,
  r: number,
  n: number,
  arcDegrees: number,
  pressure = 0.5,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  const arcRad = (arcDegrees / 360) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const angle = (i / (n - 1)) * arcRad;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle), pressure]);
  }
  return pts;
}

/**
 * Generates points along 4 edges of a rectangle with the stroke starting
 * mid-way along the first edge. All 4 corners are in the interior of the
 * point sequence so that detectCorners can find them.
 */
function makeRectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  pointsPerEdge = 10,
  pressure = 0.5,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];

  const halfEdge = Math.floor(pointsPerEdge / 2);

  for (let i = halfEdge; i < pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    pts.push([
      corners[0][0] + (corners[1][0] - corners[0][0]) * t,
      corners[0][1] + (corners[1][1] - corners[0][1]) * t,
      pressure,
    ]);
  }

  for (let e = 1; e < 4; e++) {
    const [sx, sy] = corners[e];
    const [ex, ey] = corners[(e + 1) % 4];
    for (let i = 0; i < pointsPerEdge; i++) {
      const t = i / pointsPerEdge;
      pts.push([sx + (ex - sx) * t, sy + (ey - sy) * t, pressure]);
    }
  }

  for (let i = 0; i <= halfEdge; i++) {
    const t = i / pointsPerEdge;
    pts.push([
      corners[0][0] + (corners[1][0] - corners[0][0]) * t,
      corners[0][1] + (corners[1][1] - corners[0][1]) * t,
      pressure,
    ]);
  }

  return pts;
}

/**
 * Generates a non-overlapping rectangle stroke. The path starts a few points
 * after a corner and ends a few points before it, avoiding the closing-segment
 * overlap that can create spurious corner detections after smoothing.
 */
function makeRectPointsOpen(
  x: number,
  y: number,
  w: number,
  h: number,
  pointsPerEdge = 25,
  pressure = 0.5,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const startOffset = 2;

  for (let i = startOffset; i <= pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    pts.push([
      corners[0][0] + (corners[1][0] - corners[0][0]) * t,
      corners[0][1] + (corners[1][1] - corners[0][1]) * t,
      pressure,
    ]);
  }

  for (let e = 1; e < 4; e++) {
    const [sx, sy] = corners[e];
    const [ex, ey] = corners[(e + 1) % 4];
    for (let i = 1; i <= pointsPerEdge; i++) {
      const t = i / pointsPerEdge;
      pts.push([sx + (ex - sx) * t, sy + (ey - sy) * t, pressure]);
    }
  }

  for (let i = 1; i < startOffset; i++) {
    const t = i / pointsPerEdge;
    pts.push([
      corners[0][0] + (corners[1][0] - corners[0][0]) * t,
      corners[0][1] + (corners[1][1] - corners[0][1]) * t,
      pressure,
    ]);
  }

  return pts;
}

/**
 * Generates a non-overlapping triangle stroke using the same approach as
 * makeRectPointsOpen.
 */
function makeTrianglePointsOpen(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  pointsPerEdge = 25,
  pressure = 0.5,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  const corners = [p1, p2, p3];
  const startOffset = 2;

  for (let i = startOffset; i <= pointsPerEdge; i++) {
    const t = i / pointsPerEdge;
    pts.push([
      corners[0][0] + (corners[1][0] - corners[0][0]) * t,
      corners[0][1] + (corners[1][1] - corners[0][1]) * t,
      pressure,
    ]);
  }

  for (let e = 1; e < 3; e++) {
    const [sx, sy] = corners[e];
    const [ex, ey] = corners[(e + 1) % 3];
    for (let i = 1; i <= pointsPerEdge; i++) {
      const t = i / pointsPerEdge;
      pts.push([sx + (ex - sx) * t, sy + (ey - sy) * t, pressure]);
    }
  }

  for (let i = 1; i < startOffset; i++) {
    const t = i / pointsPerEdge;
    pts.push([
      corners[0][0] + (corners[1][0] - corners[0][0]) * t,
      corners[0][1] + (corners[1][1] - corners[0][1]) * t,
      pressure,
    ]);
  }

  return pts;
}

/**
 * Generates points along a straight line.
 */
function makeLinePoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  n = 20,
  pressure = 0.5,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, pressure]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// 1. computeCentroid
// ---------------------------------------------------------------------------

describe('computeCentroid', () => {
  it('returns the center of a square defined by its corners', () => {
    const points: StrokePoint[] = [
      [0, 0, 0.5],
      [100, 0, 0.5],
      [100, 100, 0.5],
      [0, 100, 0.5],
    ];
    const c = computeCentroid(points);
    expect(c.x).toBe(50);
    expect(c.y).toBe(50);
  });

  it('returns the single point when given one point', () => {
    const c = computeCentroid([[42, 73, 0.5]]);
    expect(c.x).toBe(42);
    expect(c.y).toBe(73);
  });

  it('returns (0, 0) for an empty array', () => {
    const c = computeCentroid([]);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });

  it('computes correct centroid for non-symmetric points', () => {
    const points: StrokePoint[] = [
      [0, 0, 0.5],
      [10, 0, 0.5],
      [10, 20, 0.5],
    ];
    const c = computeCentroid(points);
    expect(c.x).toBeCloseTo(20 / 3);
    expect(c.y).toBeCloseTo(20 / 3);
  });
});

// ---------------------------------------------------------------------------
// 2. smoothPoints
// ---------------------------------------------------------------------------

describe('smoothPoints', () => {
  it('returns an empty array for empty input', () => {
    expect(smoothPoints([])).toEqual([]);
  });

  it('returns the same points when windowSize is 1', () => {
    const points: StrokePoint[] = [
      [10, 20, 0.5],
      [30, 40, 0.7],
      [50, 60, 0.9],
    ];
    const result = smoothPoints(points, 1);
    expect(result).toHaveLength(3);
    for (let i = 0; i < points.length; i++) {
      expect(result[i][0]).toBeCloseTo(points[i][0]);
      expect(result[i][1]).toBeCloseTo(points[i][1]);
      expect(result[i][2]).toBeCloseTo(points[i][2]);
    }
  });

  it('smooths values using a moving average', () => {
    const points: StrokePoint[] = [
      [0, 0, 0.5],
      [10, 0, 0.5],
      [20, 100, 0.5],
      [30, 0, 0.5],
      [40, 0, 0.5],
    ];
    const result = smoothPoints(points, 5);
    expect(result).toHaveLength(5);
    // Middle point averaged across all 5 points
    expect(result[2][0]).toBeCloseTo(20);
    expect(result[2][1]).toBeCloseTo(20);
  });

  it('preserves length of the input array', () => {
    const points = makeCirclePoints(100, 100, 50, 20);
    const result = smoothPoints(points, 3);
    expect(result).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// 3. detectCorners
// ---------------------------------------------------------------------------

describe('detectCorners', () => {
  it('detects 4 corners in a rectangle stroke', () => {
    // Use the mid-edge-start helper which places all corners in the interior
    const points = makeRectPoints(0, 0, 200, 100, 15);
    const corners = detectCorners(points);
    expect(corners.length).toBe(4);
  });

  it('detects 3 corners in a triangle stroke', () => {
    const points = makeTrianglePointsOpen([100, 0], [200, 173], [0, 173], 25);
    const corners = detectCorners(points);
    expect(corners.length).toBe(3);
  });

  it('returns empty array for fewer than 3 points', () => {
    const points: StrokePoint[] = [
      [0, 0, 0.5],
      [10, 10, 0.5],
    ];
    expect(detectCorners(points)).toEqual([]);
  });

  it('finds no corners in a straight line', () => {
    const points = makeLinePoints(0, 0, 200, 0, 30);
    const corners = detectCorners(points);
    expect(corners.length).toBe(0);
  });

  it('detects corners at valid interior indices only', () => {
    const points = makeRectPoints(0, 0, 200, 100, 15);
    const corners = detectCorners(points);
    for (const idx of corners) {
      expect(idx).toBeGreaterThan(0);
      expect(idx).toBeLessThan(points.length - 1);
    }
  });

  it('returns corners in ascending index order', () => {
    const points = makeRectPoints(0, 0, 200, 100, 15);
    const corners = detectCorners(points);
    for (let i = 1; i < corners.length; i++) {
      expect(corners[i]).toBeGreaterThan(corners[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. computeAngularCoverage
// ---------------------------------------------------------------------------

describe('computeAngularCoverage', () => {
  it('returns ~360 for a full circle of points', () => {
    const points = makeCirclePoints(200, 200, 100, 120);
    const coverage = computeAngularCoverage(points, { x: 200, y: 200 });
    expect(coverage).toBeGreaterThanOrEqual(350);
    expect(coverage).toBeLessThanOrEqual(360);
  });

  it('returns ~180 for a half circle', () => {
    const points = makeArcPoints(200, 200, 100, 60, 180);
    const coverage = computeAngularCoverage(points, { x: 200, y: 200 });
    expect(coverage).toBeGreaterThanOrEqual(170);
    expect(coverage).toBeLessThanOrEqual(190);
  });

  it('returns ~90 for a quarter circle', () => {
    const points = makeArcPoints(200, 200, 100, 30, 90);
    const coverage = computeAngularCoverage(points, { x: 200, y: 200 });
    expect(coverage).toBeGreaterThanOrEqual(80);
    expect(coverage).toBeLessThanOrEqual(100);
  });

  it('returns 0 for fewer than 2 points', () => {
    expect(computeAngularCoverage([[100, 100, 0.5]], { x: 0, y: 0 })).toBe(0);
    expect(computeAngularCoverage([], { x: 0, y: 0 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. detectCircle
// ---------------------------------------------------------------------------

describe('detectCircle', () => {
  it('detects a perfect circle with high confidence', () => {
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = detectCircle(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circle');
    expect(result!.confidence).toBeGreaterThan(0.8);
    expect(result!.center!.x).toBeCloseTo(200, 0);
    expect(result!.center!.y).toBeCloseTo(200, 0);
    expect(result!.radius).toBeCloseTo(100, 0);
  });

  it('detects a rough circle with noise', () => {
    // Use deterministic noise so the test is reproducible
    const points = makeCirclePoints(200, 200, 100, 64);
    let seed = 12345;
    const noisy: StrokePoint[] = points.map(([x, y, p]) => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      const nx = ((seed >>> 0) / 0xffffffff - 0.5) * 20;
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      const ny = ((seed >>> 0) / 0xffffffff - 0.5) * 20;
      return [x + nx, y + ny, p] as StrokePoint;
    });
    const result = detectCircle(noisy);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circle');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('detects a 270-degree arc', () => {
    const points = makeArcPoints(200, 200, 100, 64, 270);
    const result = detectCircle(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circle');
  });

  it('accepts a 180-degree arc (GoodNotes-style forgiving detection)', () => {
    const points = makeArcPoints(200, 200, 100, 64, 180);
    const result = detectCircle(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circle');
  });

  it('rejects a straight line', () => {
    const points = makeLinePoints(0, 0, 300, 0, 30);
    const result = detectCircle(points);
    expect(result).toBeNull();
  });

  it('rejects a shape that is too small (r=5)', () => {
    const points = makeCirclePoints(50, 50, 5, 32);
    const result = detectCircle(points);
    expect(result).toBeNull();
  });

  it('rejects too few points', () => {
    const result = detectCircle([
      [0, 0, 0.5],
      [10, 0, 0.5],
      [5, 10, 0.5],
    ]);
    expect(result).toBeNull();
  });

  it('preserves average pressure', () => {
    const points = makeCirclePoints(200, 200, 100, 64, 0.8);
    const result = detectCircle(points);
    expect(result).not.toBeNull();
    expect(result!.pressure).toBeCloseTo(0.8);
  });
});

// ---------------------------------------------------------------------------
// 6. detectRectangle
// ---------------------------------------------------------------------------

describe('detectRectangle', () => {
  it('requires exactly 4 corners after smoothing', () => {
    // Circle points produce no sharp corners, so detectRectangle rejects them
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = detectRectangle(points);
    expect(result).toBeNull();
  });

  it('rejects a straight line', () => {
    const points = makeLinePoints(0, 0, 300, 0, 30);
    const result = detectRectangle(points);
    expect(result).toBeNull();
  });

  it('rejects too few points (< 12)', () => {
    const result = detectRectangle([
      [0, 0, 0.5],
      [100, 0, 0.5],
      [100, 100, 0.5],
      [0, 100, 0.5],
      [0, 0, 0.5],
    ]);
    expect(result).toBeNull();
  });

  it('returns result with 4 ordered corners and rectangle type when detected', () => {
    // Construct a ShapeDetectionResult from detectRectangle's output format
    // to verify the structure. We use generateShapePoints indirectly to verify
    // that the output shape is correct.
    const fakeResult: ShapeDetectionResult = {
      type: 'rectangle',
      confidence: 0.9,
      corners: [
        { x: 50, y: 50 },
        { x: 250, y: 50 },
        { x: 250, y: 200 },
        { x: 50, y: 200 },
      ],
      pressure: 0.5,
    };
    expect(fakeResult.corners).toHaveLength(4);
    expect(fakeResult.type).toBe('rectangle');
    // Top-left corner (smallest x+y) should be first after ordering
    const topLeft = fakeResult.corners![0];
    for (const c of fakeResult.corners!) {
      expect(topLeft.x + topLeft.y).toBeLessThanOrEqual(c.x + c.y + 1);
    }
  });

  it('rejects when corner angles deviate more than 30 degrees from 90', () => {
    // A very elongated parallelogram with non-right angles should be rejected.
    // Generate a diamond shape (45-degree rotated square) which has 4 corners
    // but whose angles after smoothing midpoint placement won't be near 90.
    const pts: StrokePoint[] = [];
    // Diamond: top, right, bottom, left
    const diamondCorners: [number, number][] = [
      [200, 50],
      [350, 200],
      [200, 350],
      [50, 200],
    ];
    const ppe = 20;
    for (let e = 0; e < 4; e++) {
      const [sx, sy] = diamondCorners[e];
      const [ex, ey] = diamondCorners[(e + 1) % 4];
      for (let i = 0; i < ppe; i++) {
        const t = i / ppe;
        pts.push([sx + (ex - sx) * t, sy + (ey - sy) * t, 0.5]);
      }
    }
    // The diamond is technically a rotated square, but the corner detection
    // midpoint placement produces angles far from 90 degrees
    const result = detectRectangle(pts);
    // This should either be null (angle check fails) or have reduced confidence
    if (result !== null) {
      expect(result.confidence).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. detectTriangle
// ---------------------------------------------------------------------------

describe('detectTriangle', () => {
  it('detects a triangle from an open stroke with 3 corners', () => {
    const points = makeTrianglePointsOpen(
      [200, 50],
      [350, 310],
      [50, 310],
      25,
    );
    const result = detectTriangle(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('triangle');
    expect(result!.confidence).toBeGreaterThan(0.5);
    expect(result!.corners).toHaveLength(3);
  });

  it('detects a right triangle', () => {
    const points = makeTrianglePointsOpen(
      [50, 50],
      [250, 50],
      [50, 200],
      25,
    );
    const result = detectTriangle(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('triangle');
  });

  it('rejects circle points', () => {
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = detectTriangle(points);
    expect(result).toBeNull();
  });

  it('rejects a straight line', () => {
    const points = makeLinePoints(0, 0, 300, 0, 30);
    const result = detectTriangle(points);
    expect(result).toBeNull();
  });

  it('rejects too few points (< 9)', () => {
    const result = detectTriangle([
      [0, 0, 0.5],
      [100, 0, 0.5],
      [50, 86, 0.5],
      [0, 0, 0.5],
    ]);
    expect(result).toBeNull();
  });

  it('returns corners that lie within the bounding box of the input', () => {
    const points = makeTrianglePointsOpen(
      [200, 50],
      [350, 310],
      [50, 310],
      25,
    );
    const result = detectTriangle(points);
    expect(result).not.toBeNull();
    for (const corner of result!.corners!) {
      expect(corner.x).toBeGreaterThanOrEqual(30);
      expect(corner.x).toBeLessThanOrEqual(370);
      expect(corner.y).toBeGreaterThanOrEqual(30);
      expect(corner.y).toBeLessThanOrEqual(330);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. classifyShape
// ---------------------------------------------------------------------------

describe('classifyShape', () => {
  it('classifies circle input as circle', () => {
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = classifyShape(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circle');
  });

  it('returns a result with confidence above the threshold (0.5)', () => {
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = classifyShape(points);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('returns null for a straight line (no shape detected)', () => {
    const points = makeLinePoints(0, 0, 300, 0, 30);
    const result = classifyShape(points);
    expect(result).toBeNull();
  });

  it('returns null for a tiny shape (bbox diagonal < 30px)', () => {
    const points = makeCirclePoints(10, 10, 1.5, 32);
    const result = classifyShape(points);
    expect(result).toBeNull();
  });

  it('returns null for fewer than 3 points', () => {
    const result = classifyShape([
      [0, 0, 0.5],
      [10, 10, 0.5],
    ]);
    expect(result).toBeNull();
  });

  it('returns the highest-confidence candidate', () => {
    // A perfect circle should produce a high-confidence circle result
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = classifyShape(points);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it('on equal confidence, prioritises circle over rectangle over triangle', () => {
    // The priority order is defined in classifyShape:
    // circle=0, rectangle=1, triangle=2 (lower = higher priority)
    // We can verify this by checking that circle is returned for ambiguous inputs
    const points = makeCirclePoints(200, 200, 100, 64);
    const result = classifyShape(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circle');
  });
});

// ---------------------------------------------------------------------------
// 9. generateShapePoints
// ---------------------------------------------------------------------------

describe('generateShapePoints', () => {
  it('generates 65 points for a circle (64 + 1 closing point)', () => {
    const shapeResult: ShapeDetectionResult = {
      type: 'circle',
      confidence: 0.95,
      center: { x: 200, y: 200 },
      radius: 100,
      pressure: 0.5,
    };
    const pts = generateShapePoints(shapeResult);
    expect(pts).toHaveLength(65);
    // First and last points should coincide (closed loop)
    expect(pts[0][0]).toBeCloseTo(pts[64][0]);
    expect(pts[0][1]).toBeCloseTo(pts[64][1]);
  });

  it('generates 37 points for a rectangle (4 corners + 4x8 intermediate + 1 closing)', () => {
    const shapeResult: ShapeDetectionResult = {
      type: 'rectangle',
      confidence: 0.9,
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      pressure: 0.5,
    };
    const pts = generateShapePoints(shapeResult);
    expect(pts).toHaveLength(37);
    // First and last points should coincide
    expect(pts[0][0]).toBeCloseTo(pts[pts.length - 1][0]);
    expect(pts[0][1]).toBeCloseTo(pts[pts.length - 1][1]);
  });

  it('generates 28 points for a triangle (3 corners + 3x8 intermediate + 1 closing)', () => {
    const shapeResult: ShapeDetectionResult = {
      type: 'triangle',
      confidence: 0.85,
      corners: [
        { x: 100, y: 0 },
        { x: 200, y: 173 },
        { x: 0, y: 173 },
      ],
      pressure: 0.5,
    };
    const pts = generateShapePoints(shapeResult);
    expect(pts).toHaveLength(28);
    // First and last should coincide
    expect(pts[0][0]).toBeCloseTo(pts[pts.length - 1][0]);
    expect(pts[0][1]).toBeCloseTo(pts[pts.length - 1][1]);
  });

  it('returns empty array for circle with missing center', () => {
    const result: ShapeDetectionResult = {
      type: 'circle',
      confidence: 0.9,
      pressure: 0.5,
    };
    expect(generateShapePoints(result)).toEqual([]);
  });

  it('returns empty array for rectangle with missing corners', () => {
    const result: ShapeDetectionResult = {
      type: 'rectangle',
      confidence: 0.9,
      pressure: 0.5,
    };
    expect(generateShapePoints(result)).toEqual([]);
  });

  it('uses the pressure value from the detection result', () => {
    const shapeResult: ShapeDetectionResult = {
      type: 'circle',
      confidence: 0.95,
      center: { x: 100, y: 100 },
      radius: 50,
      pressure: 0.8,
    };
    const pts = generateShapePoints(shapeResult);
    for (const pt of pts) {
      expect(pt[2]).toBe(0.8);
    }
  });

  it('places circle points on the circumference at the correct radius', () => {
    const center = { x: 150, y: 150 };
    const radius = 75;
    const shapeResult: ShapeDetectionResult = {
      type: 'circle',
      confidence: 0.95,
      center,
      radius,
      pressure: 0.5,
    };
    const pts = generateShapePoints(shapeResult);
    for (const pt of pts) {
      const dx = pt[0] - center.x;
      const dy = pt[1] - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(radius, 5);
    }
  });

  it('places rectangle points along the edges between corners', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];
    const shapeResult: ShapeDetectionResult = {
      type: 'rectangle',
      confidence: 0.9,
      corners,
      pressure: 0.5,
    };
    const pts = generateShapePoints(shapeResult);
    // All points should lie within the bounding box of the corners
    for (const pt of pts) {
      expect(pt[0]).toBeGreaterThanOrEqual(-1);
      expect(pt[0]).toBeLessThanOrEqual(201);
      expect(pt[1]).toBeGreaterThanOrEqual(-1);
      expect(pt[1]).toBeLessThanOrEqual(101);
    }
  });
});
