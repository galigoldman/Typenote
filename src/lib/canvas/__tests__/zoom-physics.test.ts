import { describe, expect, it } from 'vitest';

import {
  MAX_ZOOM,
  MIN_ZOOM,
  SPRING_THRESHOLD,
  clampOffset,
  clampZoom,
  focalPointOffset,
  isMomentumStopped,
  isSpringSettled,
  momentumStep,
  rubberBand,
  rubberBandZoom,
  springStep,
  type SpringState,
} from '../zoom-physics';

describe('springStep', () => {
  it('moves toward the target', () => {
    const state: SpringState = { position: 0, velocity: 0, target: 100 };
    const next = springStep(state, 0.016);
    expect(next.position).toBeGreaterThan(0);
    expect(next.velocity).toBeGreaterThan(0);
    expect(next.target).toBe(100);
  });

  it('decelerates as it approaches target', () => {
    const state: SpringState = { position: 90, velocity: 100, target: 100 };
    const next = springStep(state, 0.016);
    // Velocity should decrease due to damping
    expect(next.velocity).toBeLessThan(100);
  });

  it('settles at the target after enough steps', () => {
    let state: SpringState = { position: 0, velocity: 0, target: 100 };
    for (let i = 0; i < 300; i++) {
      state = springStep(state, 0.016);
    }
    expect(state.position).toBeCloseTo(100, 0);
    expect(isSpringSettled(state)).toBe(true);
  });

  it('caps dt to prevent physics explosion', () => {
    const state: SpringState = { position: 0, velocity: 0, target: 100 };
    // Huge dt (simulating tab coming back from background)
    const next = springStep(state, 5.0);
    // Should not overshoot wildly — dt is capped at 0.032
    expect(Math.abs(next.position)).toBeLessThan(200);
  });
});

describe('isSpringSettled', () => {
  it('returns true when position and velocity are below threshold', () => {
    const state: SpringState = {
      position: 100.001,
      velocity: 0.001,
      target: 100,
    };
    expect(isSpringSettled(state, 0.01)).toBe(true);
  });

  it('returns false when velocity is high', () => {
    const state: SpringState = {
      position: 100,
      velocity: 10,
      target: 100,
    };
    expect(isSpringSettled(state)).toBe(false);
  });

  it('returns false when far from target', () => {
    const state: SpringState = {
      position: 50,
      velocity: 0,
      target: 100,
    };
    expect(isSpringSettled(state)).toBe(false);
  });
});

describe('momentumStep', () => {
  it('decays velocity each step', () => {
    const v = momentumStep(100, 0.95);
    expect(v).toBe(95);
  });

  it('approaches zero after many steps', () => {
    let v = 100;
    for (let i = 0; i < 60; i++) {
      v = momentumStep(v, 0.95);
    }
    expect(v).toBeLessThan(5);
  });
});

describe('isMomentumStopped', () => {
  it('returns true below threshold', () => {
    expect(isMomentumStopped(0.1, 0.5)).toBe(true);
  });

  it('returns false above threshold', () => {
    expect(isMomentumStopped(5, 0.5)).toBe(false);
  });

  it('works with negative velocity', () => {
    expect(isMomentumStopped(-0.1, 0.5)).toBe(true);
  });
});

describe('rubberBand', () => {
  it('returns ~55% of small offsets', () => {
    const result = rubberBand(10, 1000, 0.55);
    expect(result).toBeCloseTo(5.47, 1);
  });

  it('asymptotically approaches dimension', () => {
    const result = rubberBand(100000, 100, 0.55);
    expect(result).toBeLessThan(100);
    expect(result).toBeGreaterThan(99);
  });

  it('returns 0 for zero offset', () => {
    expect(rubberBand(0, 1000)).toBe(0);
  });

  it('returns 0 for zero dimension', () => {
    expect(rubberBand(100, 0)).toBe(0);
  });
});

describe('clampZoom', () => {
  it('clamps below MIN_ZOOM', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
  });

  it('clamps above MAX_ZOOM', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
  });

  it('passes through valid values', () => {
    expect(clampZoom(2)).toBe(2);
  });
});

describe('rubberBandZoom', () => {
  it('returns the zoom unmodified within bounds', () => {
    expect(rubberBandZoom(1.0)).toBe(1.0);
    expect(rubberBandZoom(2.5)).toBe(2.5);
  });

  it('applies rubber-band above MAX_ZOOM', () => {
    const result = rubberBandZoom(MAX_ZOOM + 1);
    expect(result).toBeGreaterThan(MAX_ZOOM);
    expect(result).toBeLessThan(MAX_ZOOM + 1);
  });

  it('applies rubber-band below MIN_ZOOM', () => {
    const result = rubberBandZoom(MIN_ZOOM - 0.2);
    expect(result).toBeLessThan(MIN_ZOOM);
    expect(result).toBeGreaterThan(MIN_ZOOM - 0.2);
  });
});

describe('focalPointOffset', () => {
  it('keeps the focal point stationary after zoom', () => {
    // Content point at (100, 0) in content space
    // Screen point at (200, 0) at scale 2.0
    const oldScale = 2.0;
    const screenPoint = 200;
    const contentPoint = (screenPoint - 0) / oldScale; // = 100
    const newScale = 3.0;
    const newOffset = focalPointOffset(screenPoint, contentPoint, newScale);
    // Verify: contentPoint * newScale + newOffset === screenPoint
    expect(contentPoint * newScale + newOffset).toBeCloseTo(screenPoint, 5);
  });
});

describe('clampOffset', () => {
  it('centers content when smaller than viewport', () => {
    // Content 500px, viewport 1000px → centered at 250px
    expect(clampOffset(0, 500, 1000)).toBe(250);
  });

  it('clamps to 0 at the start of overflow', () => {
    // Content 2000px, viewport 1000px, offset 100 → clamp to 0
    expect(clampOffset(100, 2000, 1000)).toBe(0);
  });

  it('clamps to min when panned too far', () => {
    // Content 2000px, viewport 1000px → min offset = -1000
    expect(clampOffset(-1500, 2000, 1000)).toBe(-1000);
  });

  it('allows valid offset in range', () => {
    expect(clampOffset(-500, 2000, 1000)).toBe(-500);
  });
});
