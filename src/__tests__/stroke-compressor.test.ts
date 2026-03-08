import { describe, it, expect } from 'vitest';
import {
  simplifyPoints,
  roundPoint,
  compressStroke,
  compressStrokes,
} from '@/lib/drawing/stroke-compressor';
import type { Point, Stroke } from '@/lib/drawing/types';

describe('simplifyPoints', () => {
  it('returns as-is when given 0, 1, or 2 points', () => {
    const empty: Point[] = [];
    const single: Point[] = [[10, 20, 0.5]];
    const two: Point[] = [
      [0, 0, 0.5],
      [10, 10, 0.8],
    ];

    expect(simplifyPoints(empty)).toEqual([]);
    expect(simplifyPoints(single)).toEqual([[10, 20, 0.5]]);
    expect(simplifyPoints(two)).toEqual([
      [0, 0, 0.5],
      [10, 10, 0.8],
    ]);
  });

  it('reduces point count for collinear (straight-line) points', () => {
    // 11 points perfectly on y = x
    const straightLine: Point[] = Array.from(
      { length: 11 },
      (_, i) => [i * 10, i * 10, 0.5] as Point,
    );

    const simplified = simplifyPoints(straightLine);

    // All intermediate points lie on the line, so only endpoints should remain
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual([0, 0, 0.5]);
    expect(simplified[simplified.length - 1]).toEqual([100, 100, 0.5]);
  });

  it('preserves endpoints', () => {
    const points: Point[] = [
      [0, 0, 0.3],
      [5, 0.1, 0.4],
      [10, 0, 0.6],
    ];

    const simplified = simplifyPoints(points);

    expect(simplified[0]).toEqual([0, 0, 0.3]);
    expect(simplified[simplified.length - 1]).toEqual([10, 0, 0.6]);
  });

  it('preserves points on significant curves', () => {
    // A triangle-shaped path: the apex is far from the base line
    const points: Point[] = [
      [0, 0, 0.5],
      [50, 100, 0.7], // 100px away from the line (0,0)→(100,0)
      [100, 0, 0.5],
    ];

    const simplified = simplifyPoints(points, 1.0);

    // The apex at (50,100) is 100px from the base — must be kept
    expect(simplified.length).toBe(3);
    expect(simplified).toEqual([
      [0, 0, 0.5],
      [50, 100, 0.7],
      [100, 0, 0.5],
    ]);
  });

  it('removes curve points that fall within tolerance', () => {
    // A very gentle curve — all intermediate deviations < 0.5px
    const points: Point[] = [
      [0, 0, 0.5],
      [10, 0.1, 0.5],
      [20, 0.2, 0.5],
      [30, 0.1, 0.5],
      [40, 0, 0.5],
    ];

    const simplified = simplifyPoints(points, 1.0);

    // All deviations from the straight line (0,0)→(40,0) are < 1px
    expect(simplified.length).toBe(2);
  });

  it('preserves pressure values through simplification', () => {
    const points: Point[] = [
      [0, 0, 0.2],
      [50, 80, 0.9], // kept — far from line
      [100, 0, 0.4],
    ];

    const simplified = simplifyPoints(points, 1.0);

    expect(simplified[1][2]).toBe(0.9);
  });

  it('respects custom tolerance', () => {
    const points: Point[] = [
      [0, 0, 0.5],
      [50, 5, 0.5], // ~5px from baseline
      [100, 0, 0.5],
    ];

    // With tight tolerance the deviation is kept
    const tight = simplifyPoints(points, 1.0);
    expect(tight.length).toBe(3);

    // With loose tolerance it is removed
    const loose = simplifyPoints(points, 10.0);
    expect(loose.length).toBe(2);
  });
});

describe('roundPoint', () => {
  it('rounds to 1 decimal place by default', () => {
    const point: Point = [12.3456, 78.9012, 0.567];
    const rounded = roundPoint(point);

    expect(rounded).toEqual([12.3, 78.9, 0.6]);
  });

  it('rounds to specified number of decimals', () => {
    const point: Point = [12.3456, 78.9012, 0.567];

    expect(roundPoint(point, 0)).toEqual([12, 79, 1]);
    expect(roundPoint(point, 2)).toEqual([12.35, 78.9, 0.57]);
    expect(roundPoint(point, 3)).toEqual([12.346, 78.901, 0.567]);
  });

  it('does not mutate the original point', () => {
    const point: Point = [1.55, 2.55, 0.55];
    roundPoint(point);

    expect(point).toEqual([1.55, 2.55, 0.55]);
  });
});

describe('compressStroke', () => {
  it('produces a stroke with fewer or equal points', () => {
    const stroke: Stroke = {
      id: 'stroke-1',
      color: '#000000',
      width: 2,
      tool: 'pen',
      points: Array.from(
        { length: 50 },
        (_, i) => [i * 2, i * 2, 0.5] as Point,
      ),
    };

    const compressed = compressStroke(stroke);

    expect(compressed.points.length).toBeLessThanOrEqual(stroke.points.length);
    // Straight line should collapse to 2 points
    expect(compressed.points.length).toBe(2);
  });

  it('preserves non-geometric stroke properties', () => {
    const stroke: Stroke = {
      id: 'abc-123',
      color: '#ff0000',
      width: 4,
      tool: 'eraser',
      points: [
        [0, 0, 0.5],
        [10, 10, 0.5],
      ],
    };

    const compressed = compressStroke(stroke);

    expect(compressed.id).toBe('abc-123');
    expect(compressed.color).toBe('#ff0000');
    expect(compressed.width).toBe(4);
    expect(compressed.tool).toBe('eraser');
  });

  it('rounds point coordinates', () => {
    const stroke: Stroke = {
      id: 's1',
      color: '#000',
      width: 1,
      tool: 'pen',
      points: [
        [0.123, 0.456, 0.789],
        [10.987, 20.654, 0.321],
      ],
    };

    const compressed = compressStroke(stroke);

    // Default rounding is 1 decimal place
    compressed.points.forEach((p) => {
      // Each coordinate should have at most 1 decimal digit
      p.forEach((val) => {
        const decimalPart = val.toString().split('.')[1] || '';
        expect(decimalPart.length).toBeLessThanOrEqual(1);
      });
    });
  });

  it('does not mutate the original stroke', () => {
    const original: Stroke = {
      id: 's1',
      color: '#000',
      width: 1,
      tool: 'pen',
      points: [
        [0, 0, 0.5],
        [5, 0.01, 0.5],
        [10, 0, 0.5],
      ],
    };
    const originalPointsLength = original.points.length;

    compressStroke(original);

    expect(original.points.length).toBe(originalPointsLength);
  });
});

describe('compressStrokes', () => {
  it('handles empty array', () => {
    expect(compressStrokes([])).toEqual([]);
  });

  it('compresses every stroke in the array', () => {
    const strokes: Stroke[] = [
      {
        id: 's1',
        color: '#000',
        width: 1,
        tool: 'pen',
        // Straight line — should collapse
        points: Array.from({ length: 20 }, (_, i) => [i, i, 0.5] as Point),
      },
      {
        id: 's2',
        color: '#f00',
        width: 2,
        tool: 'pen',
        // Straight horizontal line
        points: Array.from({ length: 15 }, (_, i) => [i * 3, 0, 0.8] as Point),
      },
    ];

    const compressed = compressStrokes(strokes);

    expect(compressed.length).toBe(2);
    expect(compressed[0].id).toBe('s1');
    expect(compressed[1].id).toBe('s2');
    expect(compressed[0].points.length).toBe(2);
    expect(compressed[1].points.length).toBe(2);
  });
});
