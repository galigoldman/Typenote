import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVersionSnapshots } from '../use-version-snapshots';
import { createVersionSnapshot } from '@/lib/actions/document-versions';

// Mock the server action
vi.mock('@/lib/actions/document-versions', () => ({
  createVersionSnapshot: vi
    .fn()
    .mockResolvedValue({ id: 'v1', created_at: '2026-04-13T12:00:00Z' }),
}));

const mockCreateVersionSnapshot = vi.mocked(createVersionSnapshot);

describe('useVersionSnapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreateVersionSnapshot.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire immediately on mount', () => {
    renderHook(() =>
      useVersionSnapshots({
        documentId: 'doc-1',
        getContentHash: () => 'hash-1',
      }),
    );

    expect(mockCreateVersionSnapshot).not.toHaveBeenCalled();
  });

  it('fires after 30s idle timeout when content changes', async () => {
    const { result } = renderHook(() =>
      useVersionSnapshots({
        documentId: 'doc-1',
        getContentHash: () => 'hash-1',
      }),
    );

    // Signal activity to start idle tracking
    act(() => result.current.onActivity());

    // Advance 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(mockCreateVersionSnapshot).toHaveBeenCalledWith('doc-1', 'idle');
  });

  it('resets idle timer on each activity signal', async () => {
    const { result } = renderHook(() =>
      useVersionSnapshots({
        documentId: 'doc-1',
        getContentHash: () => 'hash-changing-' + Date.now(),
      }),
    );

    // Signal activity
    act(() => result.current.onActivity());

    // Advance 20 seconds (less than 30s)
    act(() => vi.advanceTimersByTime(20_000));

    // Signal activity again — should reset the timer
    act(() => result.current.onActivity());

    // Advance 20 more seconds (total 40s from start, but only 20s from last activity)
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    // Should NOT have fired yet (only 20s since last activity, need 30s)
    expect(mockCreateVersionSnapshot).not.toHaveBeenCalled();
  });

  it('skips snapshot when content has not changed', async () => {
    const stableHash = 'stable-hash';

    const { result } = renderHook(() =>
      useVersionSnapshots({
        documentId: 'doc-1',
        getContentHash: () => stableHash,
      }),
    );

    // First activity + idle → snapshot
    act(() => result.current.onActivity());
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    const callCountAfterFirst = mockCreateVersionSnapshot.mock.calls.length;

    // Second activity + idle → same hash, should skip
    act(() => result.current.onActivity());
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(mockCreateVersionSnapshot.mock.calls.length).toBe(
      callCountAfterFirst,
    );
  });

  it('fires periodic snapshot after 5 minutes of continuous activity', async () => {
    let hashCounter = 0;

    const { result } = renderHook(() =>
      useVersionSnapshots({
        documentId: 'doc-1',
        getContentHash: () => `hash-${hashCounter++}`,
      }),
    );

    // Simulate continuous activity — signal every 20 seconds to prevent idle trigger
    for (let i = 0; i < 15; i++) {
      act(() => result.current.onActivity());
      act(() => vi.advanceTimersByTime(20_000));
    }

    // At 5 minutes (300s), the periodic timer should have fired
    await act(async () => {
      vi.advanceTimersByTime(0); // flush microtasks
    });

    const periodicCalls = mockCreateVersionSnapshot.mock.calls.filter(
      (c) => c[1] === 'periodic',
    );
    expect(periodicCalls.length).toBeGreaterThanOrEqual(1);
  });
});
