import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './use-auto-save';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with "saved" status', () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(saveFn));

    expect(result.current.status).toBe('saved');
  });

  it('sets status to "unsaved" when trigger is called', () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(saveFn));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.status).toBe('unsaved');
  });

  it('calls save function and sets status to "saved" after debounce', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(saveFn, 500));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.status).toBe('unsaved');
    expect(saveFn).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
      // Flush microtasks for the async save
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');
  });

  it('resets debounce timer when trigger is called multiple times', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(saveFn, 500));

    act(() => {
      result.current.trigger();
    });

    // Advance partially
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Trigger again - should reset the timer
    act(() => {
      result.current.trigger();
    });

    // Advance past original debounce but not past reset
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(saveFn).not.toHaveBeenCalled();

    // Now advance past the reset debounce
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalledOnce();
  });

  it('flush immediately saves when status is "unsaved"', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(saveFn, 500));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.status).toBe('unsaved');

    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');
  });

  it('updates lastSaveTimestampRef when saveFn returns updated_at', async () => {
    const saveFn = vi
      .fn()
      .mockResolvedValue({ updated_at: '2026-01-01T00:00:00Z' });
    const { result } = renderHook(() => useAutoSave(saveFn, 500));

    act(() => {
      result.current.trigger();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.lastSaveTimestampRef.current).toBe(
      '2026-01-01T00:00:00Z',
    );
  });

  it('keeps lastSaveTimestampRef null when saveFn returns void', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(saveFn, 500));

    act(() => {
      result.current.trigger();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.lastSaveTimestampRef.current).toBeNull();
  });

  it('sets status back to "unsaved" when save fails', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Save failed'));
    const { result } = renderHook(() => useAutoSave(saveFn, 500));

    act(() => {
      result.current.trigger();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveFn).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('unsaved');
  });
});
