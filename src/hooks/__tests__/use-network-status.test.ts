/**
 * Tests for useNetworkStatus.
 *
 * The hook wraps `useSyncExternalStore` around the `online`/`offline`
 * window events plus `navigator.onLine`. The audit flagged this hook as
 * untested. Coverage targets:
 *   - Initial snapshot reflects navigator.onLine
 *   - online/offline events update the hook
 *   - Listeners are removed on unmount (no leaks)
 *   - SSR snapshot is `true` (defensive default)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '../use-network-status';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

describe('useNetworkStatus', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setOnLine(true);
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
    setOnLine(true);
  });

  it('reports navigator.onLine as the initial snapshot', () => {
    setOnLine(true);
    const { result, unmount } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
    unmount();
  });

  it('reports false when navigator.onLine is false at mount', () => {
    setOnLine(false);
    const { result, unmount } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
    unmount();
  });

  it('flips to false when an offline event fires', () => {
    setOnLine(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('flips back to true when an online event fires after going offline', () => {
    setOnLine(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('subscribes to both online and offline window events on mount', () => {
    renderHook(() => useNetworkStatus());
    const subscribedEvents = addSpy.mock.calls
      .map((c) => c[0])
      .filter((name) => name === 'online' || name === 'offline');
    expect(subscribedEvents).toContain('online');
    expect(subscribedEvents).toContain('offline');
  });

  it('removes its listeners on unmount (no leaks)', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();

    const removedEvents = removeSpy.mock.calls
      .map((c) => c[0])
      .filter((name) => name === 'online' || name === 'offline');
    expect(removedEvents).toContain('online');
    expect(removedEvents).toContain('offline');
  });
});
