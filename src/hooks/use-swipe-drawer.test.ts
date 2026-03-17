import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipeDrawer } from './use-swipe-drawer';

function dispatchTouch(
  el: HTMLElement,
  type: string,
  clientX: number,
  clientY: number,
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX, clientY }],
  });
  el.dispatchEvent(event);
}

function createRef(el: HTMLElement) {
  return { current: el };
}

describe('useSwipeDrawer', () => {
  it('fires onOpen on rightward swipe starting from left edge', () => {
    const el = document.createElement('div');
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useSwipeDrawer(createRef(el), { onOpen, onClose, isOpen: false }),
    );

    dispatchTouch(el, 'touchstart', 10, 100);
    dispatchTouch(el, 'touchmove', 80, 100);
    dispatchTouch(el, 'touchend', 0, 0);

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fires onClose on leftward swipe when isOpen is true', () => {
    const el = document.createElement('div');
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useSwipeDrawer(createRef(el), { onOpen, onClose, isOpen: true }),
    );

    dispatchTouch(el, 'touchstart', 200, 100);
    dispatchTouch(el, 'touchmove', 100, 100);
    dispatchTouch(el, 'touchend', 0, 0);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does NOT fire onOpen when swipe starts from middle of screen', () => {
    const el = document.createElement('div');
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useSwipeDrawer(createRef(el), { onOpen, onClose, isOpen: false }),
    );

    dispatchTouch(el, 'touchstart', 200, 100);
    dispatchTouch(el, 'touchmove', 280, 100);
    dispatchTouch(el, 'touchend', 0, 0);

    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT fire on vertical-dominant swipes', () => {
    const el = document.createElement('div');
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useSwipeDrawer(createRef(el), { onOpen, onClose, isOpen: false }),
    );

    dispatchTouch(el, 'touchstart', 10, 100);
    dispatchTouch(el, 'touchmove', 30, 250);
    dispatchTouch(el, 'touchend', 0, 0);

    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not attach listeners when enabled is false', () => {
    const el = document.createElement('div');
    const addSpy = vi.spyOn(el, 'addEventListener');
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useSwipeDrawer(createRef(el), {
        onOpen,
        onClose,
        isOpen: false,
        enabled: false,
      }),
    );

    expect(addSpy).not.toHaveBeenCalled();

    dispatchTouch(el, 'touchstart', 10, 100);
    dispatchTouch(el, 'touchmove', 80, 100);
    dispatchTouch(el, 'touchend', 0, 0);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('resets tracking state on touchend', () => {
    const el = document.createElement('div');
    const onOpen = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useSwipeDrawer(createRef(el), { onOpen, onClose, isOpen: false }),
    );

    // First swipe from edge — fires onOpen
    dispatchTouch(el, 'touchstart', 10, 100);
    dispatchTouch(el, 'touchmove', 80, 100);
    dispatchTouch(el, 'touchend', 0, 0);
    expect(onOpen).toHaveBeenCalledOnce();

    // Second touch from middle of screen — should NOT fire onOpen
    // because touchend reset the edge swipe tracking
    dispatchTouch(el, 'touchstart', 200, 100);
    dispatchTouch(el, 'touchmove', 280, 100);
    dispatchTouch(el, 'touchend', 0, 0);

    expect(onOpen).toHaveBeenCalledOnce();
  });
});
