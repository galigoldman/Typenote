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

  it('returns quota info for authenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const quotaData = {
      used: 12,
      limit: 30,
      remaining: 18,
      tier: 'free',
      resetsAt: '2026-03-18T00:00:00.000Z',
    };
    mockGetQuota.mockResolvedValue(quotaData);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(quotaData);
    expect(mockGetQuota).toHaveBeenCalledWith('user-123');
  });

  it('returns remaining=0 when quota exhausted', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockGetQuota.mockResolvedValue({
      used: 30,
      limit: 30,
      remaining: 0,
      tier: 'free',
      resetsAt: '2026-03-18T00:00:00.000Z',
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.remaining).toBe(0);
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
