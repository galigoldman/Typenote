import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoSave } from './use-auto-save';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // 1. Status transitions — happy path
  // ---------------------------------------------------------------------------
  describe('status transitions — happy path', () => {
    it('initial status is "saved"', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn));

      expect(result.current.status).toBe('saved');
      expect(result.current.retryCount).toBe(0);
      expect(result.current.errorDetails).toBeNull();
      expect(result.current.errorType).toBeNull();
    });

    it('calling trigger() sets status to "unsaved"', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn));

      act(() => {
        result.current.trigger();
      });

      expect(result.current.status).toBe('unsaved');
    });

    it('after debounce, status becomes "saving" then "saved"', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      expect(result.current.status).toBe('unsaved');
      expect(saveFn).not.toHaveBeenCalled();

      // Advance past the 800ms debounce — saveFn fires, status becomes 'saving'
      // then resolves to 'saved'
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(saveFn).toHaveBeenCalledOnce();
      expect(result.current.status).toBe('saved');
    });

    it('lastSaveTimestampRef is updated on success when updated_at is returned', async () => {
      const saveFn = vi
        .fn()
        .mockResolvedValue({ updated_at: '2026-03-18T12:00:00Z' });
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      expect(result.current.lastSaveTimestampRef.current).toBeNull();

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.lastSaveTimestampRef.current).toBe(
        '2026-03-18T12:00:00Z',
      );
    });

    it('lastSaveTimestampRef stays null when saveFn returns void', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.lastSaveTimestampRef.current).toBeNull();
    });

    it('debounce resets when trigger is called multiple times', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      // Advance 500ms (not past debounce yet)
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Trigger again — should reset the 800ms timer
      act(() => {
        result.current.trigger();
      });

      // Advance 500ms more — would have passed original 800ms, but timer was reset
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(saveFn).not.toHaveBeenCalled();

      // Advance the remaining 300ms of the reset timer
      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(saveFn).toHaveBeenCalledOnce();
      expect(result.current.status).toBe('saved');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Retry on network error
  // ---------------------------------------------------------------------------
  describe('retry on network error', () => {
    it('retries on TypeError (network failure) with incrementing retryCount', async () => {
      const saveFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Trigger and advance past debounce
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      // First failure → retrying, retryCount = 1
      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(1);
      expect(result.current.errorType).toBe('network');
      expect(result.current.errorDetails).toBeTruthy();
    });

    it('after 3 retries with backoff, status becomes "error"', async () => {
      const saveFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Trigger and advance past debounce — first call
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      // After 1st failure: retrying, retryCount=1, next retry in 1s
      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(1);

      // Advance 1s — 2nd attempt fires
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      // After 2nd failure: retrying, retryCount=2, next retry in 2s
      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(2);

      // Advance 2s — 3rd attempt fires
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // After 3rd failure: retrying, retryCount=3, next retry in 4s
      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(3);

      // Advance 4s — 4th attempt fires, but retryCount is already 3 so it gives up
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
      });

      // After exceeding max retries: error
      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('network');
      expect(result.current.errorDetails).toContain('Network error');
    });

    it('retries on transient server errors (500)', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValue(new Error('500 Internal Server Error'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(1);
      expect(result.current.errorType).toBe('network');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. No retry on auth error
  // ---------------------------------------------------------------------------
  describe('no retry on auth error', () => {
    it('goes directly to "error" on "Not authenticated"', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValue(new Error('Not authenticated'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('auth');
      expect(result.current.retryCount).toBe(0);
      expect(result.current.errorDetails).toBeTruthy();
    });

    it('goes directly to "error" on 401', async () => {
      const saveFn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('auth');
      expect(result.current.retryCount).toBe(0);
    });

    it('goes directly to "error" on 403', async () => {
      const saveFn = vi.fn().mockRejectedValue(new Error('403 Forbidden'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('auth');
      expect(result.current.retryCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. No retry on permanent error
  // ---------------------------------------------------------------------------
  describe('no retry on permanent error', () => {
    it('goes directly to "error" on "400 Bad Request"', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValue(new Error('400 Bad Request'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('permanent');
      expect(result.current.retryCount).toBe(0);
    });

    it('goes directly to "error" on unknown error string', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValue(new Error('Something unexpected'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('permanent');
      expect(result.current.retryCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Retry count resets on success
  // ---------------------------------------------------------------------------
  describe('retry count resets on success', () => {
    it('after failing twice then succeeding, retryCount resets to 0 and errorDetails clears', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({ updated_at: '2026-03-18T14:00:00Z' });
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Trigger and advance past debounce — first call fails
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(1);
      expect(result.current.errorDetails).toBeTruthy();

      // Advance 1s — second call fails
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(2);

      // Advance 2s — third call succeeds
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('saved');
      expect(result.current.retryCount).toBe(0);
      expect(result.current.errorDetails).toBeNull();
      expect(result.current.errorType).toBeNull();
      expect(result.current.lastSaveTimestampRef.current).toBe(
        '2026-03-18T14:00:00Z',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. retryNow() manual trigger
  // ---------------------------------------------------------------------------
  describe('retryNow() manual trigger', () => {
    it('after entering error state, retryNow() calls saveFn again', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValue(new Error('400 Bad Request'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Trigger -> debounce -> save fails permanently
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(saveFn).toHaveBeenCalledTimes(1);

      // Now make saveFn succeed
      saveFn.mockResolvedValueOnce({ updated_at: '2026-03-18T15:00:00Z' });

      // Call retryNow()
      await act(async () => {
        result.current.retryNow();
        await Promise.resolve();
      });

      expect(saveFn).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe('saved');
      expect(result.current.retryCount).toBe(0);
      expect(result.current.lastSaveTimestampRef.current).toBe(
        '2026-03-18T15:00:00Z',
      );
    });

    it('retryNow() resets retryCount before calling save', async () => {
      // Fail with network error to get into retrying state
      const saveFn = vi
        .fn()
        .mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.retryCount).toBe(1);

      // Make saveFn succeed on the next call
      saveFn.mockResolvedValueOnce({ updated_at: '2026-03-18T16:00:00Z' });

      // Cancel the pending retry timeout and manually retry
      await act(async () => {
        result.current.retryNow();
        await Promise.resolve();
      });

      expect(result.current.status).toBe('saved');
      expect(result.current.retryCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. New trigger() resets retry state
  // ---------------------------------------------------------------------------
  describe('new trigger() resets retry state', () => {
    it('while in "retrying" state, trigger() resets retryCount and errorDetails', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue({ updated_at: '2026-03-18T17:00:00Z' });
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Trigger -> debounce -> first save fails (network)
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');
      expect(result.current.retryCount).toBe(1);
      expect(result.current.errorDetails).toBeTruthy();

      // Call trigger() with "new content" — should reset retry state
      act(() => {
        result.current.trigger();
      });

      expect(result.current.status).toBe('unsaved');
      expect(result.current.retryCount).toBe(0);
      expect(result.current.errorDetails).toBeNull();
      expect(result.current.errorType).toBeNull();

      // Advance past debounce — saveFn should be called again (now succeeds)
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('saved');
      expect(result.current.retryCount).toBe(0);
      expect(result.current.errorDetails).toBeNull();
    });

    it('trigger() cancels pending retry timeout', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Trigger -> debounce -> fails with network error
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');

      // Now trigger() before the retry timeout (1s) fires
      act(() => {
        result.current.trigger();
      });

      // Advance past what would have been the retry timeout — should NOT fire
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // saveFn should have been called only once so far (the first failed attempt)
      expect(saveFn).toHaveBeenCalledTimes(1);

      // Now advance past the new debounce (800ms total, 300ms remaining)
      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(saveFn).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe('saved');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Exponential backoff timing
  // ---------------------------------------------------------------------------
  describe('exponential backoff timing', () => {
    it('retries at ~1s, ~2s, ~4s intervals', async () => {
      const saveFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      // Initial trigger + debounce
      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      // 1st failure — saveFn called once, retry scheduled at 1s
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(result.current.retryCount).toBe(1);

      // Advance 999ms — should NOT have retried yet
      await act(async () => {
        vi.advanceTimersByTime(999);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledTimes(1);

      // Advance 1ms more (total 1000ms) — 2nd attempt fires
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledTimes(2);
      expect(result.current.retryCount).toBe(2);

      // Advance 1999ms — should NOT have retried yet
      await act(async () => {
        vi.advanceTimersByTime(1999);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledTimes(2);

      // Advance 1ms more (total 2000ms) — 3rd attempt fires
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledTimes(3);
      expect(result.current.retryCount).toBe(3);

      // Advance 3999ms — should NOT have retried yet
      await act(async () => {
        vi.advanceTimersByTime(3999);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledTimes(3);

      // Advance 1ms more (total 4000ms) — 4th attempt fires (exceeds max retries)
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledTimes(4);
      expect(result.current.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // Additional edge cases
  // ---------------------------------------------------------------------------
  describe('additional edge cases', () => {
    it('flush immediately saves and cancels pending debounce', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        await result.current.flush();
      });

      expect(saveFn).toHaveBeenCalledOnce();
      expect(result.current.status).toBe('saved');

      // Advancing past original debounce should NOT call saveFn again
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(saveFn).toHaveBeenCalledOnce();
    });

    it('flush works even when no trigger was called', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      expect(result.current.status).toBe('saved');

      await act(async () => {
        await result.current.flush();
      });

      expect(saveFn).toHaveBeenCalledOnce();
      expect(result.current.status).toBe('saved');
    });

    it('uses custom debounce time', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useAutoSave(saveFn, 200));

      act(() => {
        result.current.trigger();
      });

      // Not enough time
      act(() => {
        vi.advanceTimersByTime(199);
      });
      expect(saveFn).not.toHaveBeenCalled();

      // Just enough
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(saveFn).toHaveBeenCalledOnce();
    });

    it('classifies 502 as retryable network error', async () => {
      const saveFn = vi.fn().mockRejectedValue(new Error('502 Bad Gateway'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');
      expect(result.current.errorType).toBe('network');
    });

    it('classifies 503 as retryable network error', async () => {
      const saveFn = vi
        .fn()
        .mockRejectedValue(new Error('503 Service Unavailable'));
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('retrying');
      expect(result.current.errorType).toBe('network');
    });

    it('classifies non-Error thrown values as permanent', async () => {
      const saveFn = vi.fn().mockRejectedValue('some string error');
      const { result } = renderHook(() => useAutoSave(saveFn, 800));

      act(() => {
        result.current.trigger();
      });

      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorType).toBe('permanent');
    });
  });
});
