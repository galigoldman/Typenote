import { describe, it, expect } from 'vitest';
import { hasStylus } from '../use-pinch-zoom';

// ── Mock TouchList helper ───────────────────────────────────────────

function makeTouchList(...items: Array<{ touchType?: string }>): TouchList {
  const list = items.map((t) => ({
    clientX: 100,
    clientY: 100,
    ...t,
  }));
  return Object.assign(list, {
    length: list.length,
    item: (i: number) => list[i] ?? null,
    [Symbol.iterator]: () => list[Symbol.iterator](),
  }) as unknown as TouchList;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('hasStylus', () => {
  it('T001: returns true when changedTouches contains a stylus touch', () => {
    const touches = makeTouchList({ touchType: 'stylus' });
    expect(hasStylus(touches)).toBe(true);
  });

  it('T001b: returns false when changedTouches contains only finger touches', () => {
    // Finger touches on iPadOS have touchType "direct" or no touchType
    const touches = makeTouchList({ touchType: 'direct' });
    expect(hasStylus(touches)).toBe(false);
  });

  it('T001c: returns false when touchType is undefined (non-Apple device)', () => {
    const touches = makeTouchList({});
    expect(hasStylus(touches)).toBe(false);
  });

  it('T002: returns false for empty TouchList', () => {
    const touches = makeTouchList();
    expect(hasStylus(touches)).toBe(false);
  });

  it('T002b: returns true when one of two touches is stylus (pinch with pen)', () => {
    const touches = makeTouchList(
      { touchType: 'direct' },
      { touchType: 'stylus' },
    );
    expect(hasStylus(touches)).toBe(true);
  });

  it('T003: returns false for two finger touches (normal pinch)', () => {
    const touches = makeTouchList(
      { touchType: 'direct' },
      { touchType: 'direct' },
    );
    expect(hasStylus(touches)).toBe(false);
  });
});
