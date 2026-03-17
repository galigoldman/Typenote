import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

type ChangeHandler = (e: MediaQueryListEvent) => void;

function createMatchMedia(initialMatches: boolean) {
  let currentMatches = initialMatches;
  const listeners: ChangeHandler[] = [];
  return {
    get matches() {
      return currentMatches;
    },
    addEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
      listeners.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    _fire(newMatches: boolean) {
      currentMatches = newMatches;
      listeners.forEach((fn) =>
        fn({ matches: newMatches } as MediaQueryListEvent),
      );
    },
    _listenerCount() {
      return listeners.length;
    },
  };
}

describe('useMediaQuery', () => {
  let mockMql: ReturnType<typeof createMatchMedia>;

  beforeEach(() => {
    mockMql = createMatchMedia(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mockMql),
    );
  });

  it('returns false initially (SSR-safe default)', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    // Before the effect runs, useState(false) is the initial value.
    // renderHook runs effects synchronously, so we verify via the mock:
    // the mock starts with matches=false, so the result stays false.
    expect(result.current).toBe(false);
  });

  it('returns true when media query matches', () => {
    mockMql = createMatchMedia(true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mockMql),
    );

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('returns false when media query does not match', () => {
    mockMql = createMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('updates when change event fires', () => {
    mockMql = createMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      mockMql._fire(true);
    });

    expect(result.current).toBe(true);

    act(() => {
      mockMql._fire(false);
    });

    expect(result.current).toBe(false);
  });

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(mockMql.addEventListener).toHaveBeenCalledOnce();
    expect(mockMql._listenerCount()).toBe(1);

    unmount();

    expect(mockMql.removeEventListener).toHaveBeenCalledOnce();
    expect(mockMql._listenerCount()).toBe(0);
  });

  it('re-evaluates when query string changes', () => {
    const narrowMql = createMatchMedia(false);
    const wideMql = createMatchMedia(true);

    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) =>
        query === '(min-width: 1024px)' ? wideMql : narrowMql,
      ),
    );

    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: '(min-width: 768px)' } },
    );

    expect(result.current).toBe(false);

    rerender({ query: '(min-width: 1024px)' });

    expect(result.current).toBe(true);
    expect(narrowMql.removeEventListener).toHaveBeenCalledOnce();
  });
});
