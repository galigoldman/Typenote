import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Stroke } from '@/types/canvas';

// Mock perfect-freehand before importing the module under test
vi.mock('perfect-freehand', () => ({
  getStroke: vi.fn(),
}));

import { getStroke } from 'perfect-freehand';
import { renderStroke, hexToRgb } from '../stroke-renderer';

const mockGetStroke = vi.mocked(getStroke);

/** Helper to build a Stroke with sensible defaults */
function makeStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: 'stroke-1',
    points: [
      [10, 20, 0.5],
      [30, 40, 0.6],
      [50, 60, 0.7],
    ],
    color: '#ff0000',
    width: 4,
    opacity: 1,
    bbox: { minX: 10, minY: 20, maxX: 50, maxY: 60 },
    createdAt: Date.now(),
    ...overrides,
  };
}

/** Creates a mock jsPDF document with spied methods */
function makeMockDoc() {
  // GState must be a real constructor so `new GState(...)` works
  const GStateMock = vi.fn(function (
    this: Record<string, unknown>,
    opts: Record<string, unknown>,
  ) {
    Object.assign(this, opts);
  });

  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    close: vi.fn(),
    fill: vi.fn(),
    setFillColor: vi.fn(),
    saveGraphicsState: vi.fn(),
    restoreGraphicsState: vi.fn(),
    setGState: vi.fn(),
    GState: GStateMock,
  };
}

describe('renderStroke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call getStroke with correct parameters', () => {
    const doc = makeMockDoc();
    const stroke = makeStroke({ width: 6 });

    mockGetStroke.mockReturnValue([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);

    renderStroke(doc as never, stroke);

    expect(mockGetStroke).toHaveBeenCalledWith(stroke.points, {
      size: 6,
      simulatePressure: false,
    });
  });

  it('should draw filled path from outline points', () => {
    const doc = makeMockDoc();
    const stroke = makeStroke();

    const polygon = [
      [5, 10],
      [20, 15],
      [35, 25],
      [40, 50],
    ];
    mockGetStroke.mockReturnValue(polygon);

    renderStroke(doc as never, stroke);

    // First point uses moveTo
    expect(doc.moveTo).toHaveBeenCalledWith(5, 10);

    // Subsequent points use lineTo
    expect(doc.lineTo).toHaveBeenCalledTimes(3);
    expect(doc.lineTo).toHaveBeenCalledWith(20, 15);
    expect(doc.lineTo).toHaveBeenCalledWith(35, 25);
    expect(doc.lineTo).toHaveBeenCalledWith(40, 50);

    // Path is closed and filled
    expect(doc.close).toHaveBeenCalledOnce();
    expect(doc.fill).toHaveBeenCalledOnce();
  });

  it('should apply correct fill color', () => {
    const doc = makeMockDoc();
    const stroke = makeStroke({ color: '#1a2b3c' });

    mockGetStroke.mockReturnValue([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);

    renderStroke(doc as never, stroke);

    // #1a2b3c -> r=26, g=43, b=60
    expect(doc.setFillColor).toHaveBeenCalledWith(26, 43, 60);
  });

  it('should apply opacity via GState', () => {
    const doc = makeMockDoc();
    const stroke = makeStroke({ opacity: 0.5 });

    mockGetStroke.mockReturnValue([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);

    renderStroke(doc as never, stroke);

    expect(doc.saveGraphicsState).toHaveBeenCalledOnce();
    expect(doc.GState).toHaveBeenCalledWith({ opacity: 0.5 });
    // setGState receives the instance created by `new GState(...)`
    expect(doc.setGState).toHaveBeenCalledOnce();
    expect(doc.setGState.mock.calls[0][0]).toEqual(
      expect.objectContaining({ opacity: 0.5 }),
    );
    expect(doc.restoreGraphicsState).toHaveBeenCalledOnce();
  });

  it('should not apply GState when opacity is 1', () => {
    const doc = makeMockDoc();
    const stroke = makeStroke({ opacity: 1 });

    mockGetStroke.mockReturnValue([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);

    renderStroke(doc as never, stroke);

    expect(doc.saveGraphicsState).not.toHaveBeenCalled();
    expect(doc.setGState).not.toHaveBeenCalled();
    expect(doc.restoreGraphicsState).not.toHaveBeenCalled();
  });

  it('should skip strokes with too few points', () => {
    const doc = makeMockDoc();
    const stroke = makeStroke();

    // Return only 2 points — not enough for a polygon
    mockGetStroke.mockReturnValue([
      [0, 0],
      [1, 1],
    ]);

    renderStroke(doc as never, stroke);

    expect(doc.moveTo).not.toHaveBeenCalled();
    expect(doc.lineTo).not.toHaveBeenCalled();
    expect(doc.close).not.toHaveBeenCalled();
    expect(doc.fill).not.toHaveBeenCalled();
  });
});

describe('hexToRgb', () => {
  it('should parse 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('should parse 3-digit hex', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('should handle hex without hash', () => {
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('should return black for invalid input', () => {
    expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 });
  });
});
