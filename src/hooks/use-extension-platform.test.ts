import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const originalMatchMedia = globalThis.window?.matchMedia;
const originalChrome = (globalThis as Record<string, unknown>).chrome;

function setPointerFine(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function setChromiumFamily(present: boolean) {
  if (present) {
    // Mimic a clean Chromium browser without the extension installed:
    // `loadTimes`/`csi`/`app` exist but `runtime` does NOT.
    (globalThis as Record<string, unknown>).chrome = {
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    };
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
}

beforeEach(() => {
  setPointerFine(true);
  setChromiumFamily(true);
});

afterEach(() => {
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  if (originalChrome) {
    (globalThis as Record<string, unknown>).chrome = originalChrome;
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
});

const { useExtensionPlatform } = await import('./use-extension-platform');

describe('useExtensionPlatform', () => {
  it('returns true on a clean Chromium desktop without the extension installed', () => {
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(true);
  });

  it('returns true on Chromium desktop with the extension already installed (chrome.runtime present)', () => {
    (globalThis as Record<string, unknown>).chrome = {
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
      runtime: { sendMessage: vi.fn() },
    };
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(true);
  });

  it('returns false on touch-primary devices (iPad/mobile)', () => {
    setPointerFine(false);
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });

  it('returns false on non-Chromium browsers (no window.chrome)', () => {
    setChromiumFamily(false);
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });

  it('returns false when window.chrome exists but lacks Chrome-family globals', () => {
    // Some non-Chromium browsers expose a stubbed `chrome` namespace.
    (globalThis as Record<string, unknown>).chrome = {};
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });
});
