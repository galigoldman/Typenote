import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

// Track the auth state change callback so tests can trigger it
let authCallback: (
  event: AuthChangeEvent,
  session: Session | null,
) => void = () => {};
const mockUnsubscribe = vi.fn();

// Shared mock for getUser — same instance returned on every createClient() call
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });

// Mock @posthog/next
const mockPostHog = {
  identify: vi.fn(),
  reset: vi.fn(),
};
vi.mock('@posthog/next', () => ({
  usePostHog: () => mockPostHog,
}));

// Mock Supabase client with shared mock functions
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (
        cb: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      getUser: mockGetUser,
    },
  }),
}));

import { PostHogIdentify } from '../identify';

describe('PostHogIdentify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    cleanup();
  });

  it('renders nothing (returns null)', () => {
    const { container } = render(<PostHogIdentify />);
    expect(container.innerHTML).toBe('');
  });

  it('identifies user on mount when already authenticated', async () => {
    const mockUser = { id: 'user-uuid-123' };
    mockGetUser.mockResolvedValueOnce({
      data: { user: mockUser },
    });

    render(<PostHogIdentify />);

    // Wait for the async getUser call
    await vi.waitFor(() => {
      expect(mockPostHog.identify).toHaveBeenCalledWith('user-uuid-123');
    });
  });

  it('identifies user when SIGNED_IN event fires', () => {
    render(<PostHogIdentify />);

    const mockSession = {
      user: { id: 'user-uuid-456' },
    } as Session;

    authCallback('SIGNED_IN', mockSession);

    expect(mockPostHog.identify).toHaveBeenCalledWith('user-uuid-456');
  });

  it('resets PostHog when SIGNED_OUT event fires', () => {
    render(<PostHogIdentify />);

    authCallback('SIGNED_OUT', null);

    expect(mockPostHog.reset).toHaveBeenCalled();
  });

  it('unsubscribes from auth changes on unmount', () => {
    const { unmount } = render(<PostHogIdentify />);
    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
