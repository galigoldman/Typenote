import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase server client
const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

// Mock rate-limit helper
const mockGetQuota = vi.fn();
vi.mock('@/lib/ai/rate-limit', () => ({
  getQuota: (...args: unknown[]) => mockGetQuota(...args),
}));

import { GET } from './route';

describe('GET /api/ai/quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns per-type quota info for authenticated beta user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const quotaData = {
      chat: { used: 42, limit: 100, remaining: 58 },
      latex: { used: 123, limit: 500, remaining: 377 },
      tier: 'beta',
      resetsAt: '2026-04-01T00:00:00.000Z',
      deepModeAvailable: false,
    };
    mockGetQuota.mockResolvedValue(quotaData);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(quotaData);
    expect(data.chat.used).toBe(42);
    expect(data.latex.remaining).toBe(377);
    expect(data.deepModeAvailable).toBe(false);
    expect(mockGetQuota).toHaveBeenCalledWith('user-123');
  });

  it('returns deepModeAvailable=true for pro user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockGetQuota.mockResolvedValue({
      chat: { used: 12, limit: 500, remaining: 488 },
      latex: { used: 5, limit: 1500, remaining: 1495 },
      tier: 'pro',
      resetsAt: '2026-04-01T00:00:00.000Z',
      deepModeAvailable: true,
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deepModeAvailable).toBe(true);
  });

  it('returns chat.remaining=0 when chat quota exhausted', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockGetQuota.mockResolvedValue({
      chat: { used: 100, limit: 100, remaining: 0 },
      latex: { used: 50, limit: 500, remaining: 450 },
      tier: 'beta',
      resetsAt: '2026-04-01T00:00:00.000Z',
      deepModeAvailable: false,
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.chat.remaining).toBe(0);
    expect(data.latex.remaining).toBe(450);
  });

  it('returns 500 when getQuota throws', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockGetQuota.mockRejectedValue(new Error('RPC failed'));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to fetch quota');
  });
});
