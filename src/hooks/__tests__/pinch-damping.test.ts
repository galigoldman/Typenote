import { describe, it, expect } from 'vitest';
import { dampPinchRatio } from '../use-pinch-zoom';

describe('dampPinchRatio', () => {
  it('returns 1.0 for ratio 1.0 (identity at no-pinch)', () => {
    expect(dampPinchRatio(1.0)).toBeCloseTo(1.0, 5);
  });

  it('dampens small pinch in (1.05 → less than 1.05)', () => {
    const result = dampPinchRatio(1.05);
    expect(result).toBeLessThan(1.05);
    expect(result).toBeGreaterThan(1.0);
  });

  it('still produces meaningful zoom for medium pinch (1.5)', () => {
    const result = dampPinchRatio(1.5);
    // With damping = 0.6, 1.5^0.6 ≈ 1.275
    expect(result).toBeGreaterThan(1.2);
    expect(result).toBeLessThan(1.35);
  });

  it('still reaches large zoom for large pinch (2.0)', () => {
    const result = dampPinchRatio(2.0);
    // With damping = 0.6, 2.0^0.6 ≈ 1.516
    expect(result).toBeGreaterThan(1.4);
  });

  it('dampens pinch out (0.5 → greater than 0.5)', () => {
    const result = dampPinchRatio(0.5);
    // With damping = 0.6, 0.5^0.6 ≈ 0.659
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(1.0);
  });

  it('returns 1.0 defensively for non-positive ratios', () => {
    expect(dampPinchRatio(0)).toBe(1.0);
    expect(dampPinchRatio(-1)).toBe(1.0);
  });

  it('is a pure function (same input → same output)', () => {
    const a = dampPinchRatio(1.3);
    const b = dampPinchRatio(1.3);
    expect(a).toBe(b);
  });
});
