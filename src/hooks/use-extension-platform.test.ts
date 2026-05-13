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

function setChromeRuntime(present: boolean) {
  if (present) {
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { sendMessage: vi.fn() },
    };
  } else {
    delete (globalThis as Record<string, unknown>).chrome;
  }
}

beforeEach(() => {
  setPointerFine(true);
  setChromeRuntime(true);
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
  it('returns true on Chromium desktop (pointer-fine + chrome.runtime)', () => {
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(true);
  });

  it('returns false on touch-primary devices (iPad/mobile)', () => {
    setPointerFine(false);
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });

  it('returns false on non-Chromium desktop (no chrome.runtime)', () => {
    setChromeRuntime(false);
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });

  it('returns false when chrome exists but sendMessage is missing', () => {
    (globalThis as Record<string, unknown>).chrome = { runtime: {} };
    const { result } = renderHook(() => useExtensionPlatform());
    expect(result.current.isSupportedPlatform).toBe(false);
  });
});
