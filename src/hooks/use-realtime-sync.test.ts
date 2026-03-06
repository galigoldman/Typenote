import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeSync } from './use-realtime-sync';

// Track the postgres_changes callback and subscribe callback
let postgresChangesCallback: (payload: unknown) => void;
let subscribeCallback: (status: string) => void;

const mockRemoveChannel = vi.fn();
const mockSubscribe = vi.fn((cb: (status: string) => void) => {
  subscribeCallback = cb;
  return mockChannel;
});
const mockOn = vi.fn(
  (_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
    postgresChangesCallback = cb;
    return { subscribe: mockSubscribe };
  },
);
const mockChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

describe('useRealtimeSync', () => {
  const defaultProps = {
    documentId: 'doc-123',
    lastSaveTimestampRef: { current: null } as React.RefObject<string | null>,
    onRemoteContentUpdate: vi.fn(),
    onRemoteTitleUpdate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with "connecting" status', () => {
    const { result } = renderHook(() => useRealtimeSync(defaultProps));
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('sets status to "connected" when subscribed', () => {
    const { result } = renderHook(() => useRealtimeSync(defaultProps));

    act(() => {
      subscribeCallback('SUBSCRIBED');
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  it('sets status to "disconnected" on channel error', () => {
    const { result } = renderHook(() => useRealtimeSync(defaultProps));

    act(() => {
      subscribeCallback('CHANNEL_ERROR');
    });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('calls onRemoteContentUpdate and onRemoteTitleUpdate on remote change', () => {
    const onContent = vi.fn();
    const onTitle = vi.fn();

    renderHook(() =>
      useRealtimeSync({
        ...defaultProps,
        onRemoteContentUpdate: onContent,
        onRemoteTitleUpdate: onTitle,
      }),
    );

    act(() => {
      postgresChangesCallback({
        new: {
          updated_at: '2026-01-01T00:00:01Z',
          content: { type: 'doc', content: [] },
          title: 'Remote Title',
        },
      });
    });

    expect(onContent).toHaveBeenCalledWith({ type: 'doc', content: [] });
    expect(onTitle).toHaveBeenCalledWith('Remote Title');
  });

  it('ignores echo: skips update when updated_at matches lastSaveTimestamp', () => {
    const onContent = vi.fn();
    const onTitle = vi.fn();
    const lastSaveRef = { current: '2026-01-01T00:00:01Z' };

    renderHook(() =>
      useRealtimeSync({
        ...defaultProps,
        lastSaveTimestampRef: lastSaveRef,
        onRemoteContentUpdate: onContent,
        onRemoteTitleUpdate: onTitle,
      }),
    );

    act(() => {
      postgresChangesCallback({
        new: {
          updated_at: '2026-01-01T00:00:01Z',
          content: { type: 'doc' },
          title: 'Same',
        },
      });
    });

    expect(onContent).not.toHaveBeenCalled();
    expect(onTitle).not.toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeSync(defaultProps));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});
