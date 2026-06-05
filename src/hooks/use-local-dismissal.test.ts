import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLocalDismissal } from './use-local-dismissal';

const STORAGE_KEY = 'typenote:latex-onboarding-dismissed';

const store: Record<string, string> = {};
const mockStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', mockStorage);
  mockStorage.getItem.mockClear();
  mockStorage.setItem.mockClear();
});

describe('useLocalDismissal', () => {
  it('returns false when localStorage key is absent', () => {
    const { result } = renderHook(() => useLocalDismissal());
    expect(result.current[0]).toBe(false);
  });

  it('returns true when localStorage key is present', () => {
    store[STORAGE_KEY] = 'true';
    const { result } = renderHook(() => useLocalDismissal());
    expect(result.current[0]).toBe(true);
  });

  it('dismiss() writes key to localStorage and updates state', () => {
    const { result } = renderHook(() => useLocalDismissal());
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);
    expect(mockStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'true');
  });

  it('dismiss function is stable across renders', () => {
    const { result, rerender } = renderHook(() => useLocalDismissal());
    const firstDismiss = result.current[1];
    rerender();
    expect(result.current[1]).toBe(firstDismiss);
  });
});
