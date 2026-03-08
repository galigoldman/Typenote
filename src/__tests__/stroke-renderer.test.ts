import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSvgPathFromStroke,
  renderStroke,
  renderAllStrokes,
} from '@/lib/drawing/stroke-renderer';
import type { Stroke } from '@/lib/drawing/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a simple pen stroke with the given points. */
function makeStroke(
  points: [number, number, number][],
  overrides?: Partial<Stroke>,
): Stroke {
  return {
    id: 'stroke-1',
    points,
    color: '#000000',
    width: 2,
    tool: 'pen',
    ...overrides,
  };
}

/**
 * Build a minimal mock of CanvasRenderingContext2D with the methods that
 * stroke-renderer.ts actually calls.
 */
function createMockCtx() {
  return {
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillStyle: '' as string,
    globalCompositeOperation: 'source-over' as string,
  } as unknown as CanvasRenderingContext2D;
}

// Mock Path2D — jsdom does not provide a native implementation.
class MockPath2D {
  d: string;
  constructor(d?: string) {
    this.d = d ?? '';
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Path2D = MockPath2D;

// ---------------------------------------------------------------------------
// getSvgPathFromStroke
// ---------------------------------------------------------------------------

describe('getSvgPathFromStroke', () => {
  it('returns an SVG path string for a stroke with 3+ points', () => {
    const stroke = makeStroke([
      [10, 10, 0.5],
      [20, 20, 0.5],
      [30, 10, 0.5],
    ]);

    const path = getSvgPathFromStroke(stroke);

    // The path should start with "M" (moveTo) and end with "Z" (close path)
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
    // Should contain quadratic Bézier commands
    expect(path).toContain('Q ');
  });

  it('returns empty string for a stroke with 0 points', () => {
    const stroke = makeStroke([]);
    const path = getSvgPathFromStroke(stroke);
    expect(path).toBe('');
  });
});

// ---------------------------------------------------------------------------
// renderStroke
// ---------------------------------------------------------------------------

describe('renderStroke', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('calls fill on the canvas context for a pen stroke', () => {
    const stroke = makeStroke([
      [10, 10, 0.5],
      [20, 20, 0.5],
      [30, 10, 0.5],
    ]);

    renderStroke(ctx, stroke);

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('#000000');
    // Composite operation should be reset to default after rendering
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('sets globalCompositeOperation to destination-out for eraser strokes', () => {
    const stroke = makeStroke(
      [
        [10, 10, 0.5],
        [20, 20, 0.5],
        [30, 10, 0.5],
      ],
      { tool: 'eraser' },
    );

    // We need to spy on the setter to verify it was set to 'destination-out'
    // before fill is called.
    const compositeValues: string[] = [];
    const mockCtx = createMockCtx();
    const originalFill = mockCtx.fill as ReturnType<typeof vi.fn>;
    originalFill.mockImplementation(() => {
      compositeValues.push(mockCtx.globalCompositeOperation);
    });

    renderStroke(mockCtx, stroke);

    // At the time fill was called, composite should have been 'destination-out'
    expect(compositeValues).toContain('destination-out');
    // After rendering, it resets to 'source-over'
    expect(mockCtx.globalCompositeOperation).toBe('source-over');
  });
});

// ---------------------------------------------------------------------------
// renderAllStrokes
// ---------------------------------------------------------------------------

describe('renderAllStrokes', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('calls clearRect then renders each stroke', () => {
    const strokes: Stroke[] = [
      makeStroke([
        [10, 10, 0.5],
        [20, 20, 0.5],
        [30, 10, 0.5],
      ]),
      makeStroke(
        [
          [40, 40, 0.5],
          [50, 50, 0.5],
          [60, 40, 0.5],
        ],
        { id: 'stroke-2', color: '#ff0000' },
      ),
    ];

    renderAllStrokes(ctx, strokes, 800, 400);

    // clearRect should be called once with full canvas dimensions
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 400);

    // fill should be called once per stroke (both strokes have enough points)
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('clears the canvas even when there are no strokes', () => {
    renderAllStrokes(ctx, [], 800, 400);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 400);
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
