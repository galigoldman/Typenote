import { describe, it, expect } from 'vitest';
import { hasStylus, shouldCountAsDoubleTap } from '../use-pinch-zoom';

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

// ── shouldCountAsDoubleTap tests ────────────────────────────────────

describe('shouldCountAsDoubleTap', () => {
  it('rejects pen tap detected via PointerEvent (lastPointerType=pen)', () => {
    // touchType is missing (non-Apple or unreliable), but PointerEvent caught it
    const touches = makeTouchList({});
    expect(shouldCountAsDoubleTap(touches, 'pen')).toBe(false);
  });

  it('rejects pen tap detected via TouchEvent (touchType=stylus)', () => {
    // PointerEvent says touch, but TouchEvent correctly reports stylus
    const touches = makeTouchList({ touchType: 'stylus' });
    expect(shouldCountAsDoubleTap(touches, 'touch')).toBe(false);
  });

  it('rejects pen tap detected by both methods', () => {
    const touches = makeTouchList({ touchType: 'stylus' });
    expect(shouldCountAsDoubleTap(touches, 'pen')).toBe(false);
  });

  it('allows finger tap (touch pointer, no stylus touchType)', () => {
    const touches = makeTouchList({ touchType: 'direct' });
    expect(shouldCountAsDoubleTap(touches, 'touch')).toBe(true);
  });

  it('allows finger tap when touchType is undefined (non-Apple device)', () => {
    const touches = makeTouchList({});
    expect(shouldCountAsDoubleTap(touches, 'touch')).toBe(true);
  });

  it('allows mouse double-click (mouse pointer, no stylus)', () => {
    const touches = makeTouchList({});
    expect(shouldCountAsDoubleTap(touches, 'mouse')).toBe(true);
  });
});
