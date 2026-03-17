import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  return { mockRpc };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    rpc: mockRpc,
  }),
}));

import { checkAndIncrementUsage, getQuota } from '../rate-limit';

afterEach(() => {
  vi.clearAllMocks();
  // Clean up any env var overrides
  delete process.env.AI_LIMIT_FREE;
  delete process.env.AI_LIMIT_PRO;
  delete process.env.AI_LIMIT_TEAM;
});

// ---------------------------------------------------------------------------
// checkAndIncrementUsage
// ---------------------------------------------------------------------------

describe('checkAndIncrementUsage', () => {
  it('calls the correct RPC with correct params', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 5, tier: 'free' }],
      error: null,
    });

    await checkAndIncrementUsage('user-123', 'gemini-2.0-flash');

    expect(mockRpc).toHaveBeenCalledWith('increment_ai_usage', {
      p_user_id: 'user-123',
      p_model: 'gemini-2.0-flash',
    });
  });

  it('returns isAllowed=true when count <= limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 10, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'gemini-2.0-flash');

    expect(result).toEqual({
      currentCount: 10,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });
  });

  it('returns isAllowed=false when count > limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 51, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'gemini-2.0-flash');

    expect(result).toEqual({
      currentCount: 51,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: false,
    });
  });

  it('throws when RPC returns error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    });

    await expect(
      checkAndIncrementUsage('user-123', 'gemini-2.0-flash'),
    ).rejects.toThrow('Rate limit check failed: connection refused');
  });

  it('uses AI_LIMIT_FREE env var override when set', async () => {
    process.env.AI_LIMIT_FREE = '100';

    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 75, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'gemini-2.0-flash');

    // 75 <= 100, so allowed (would be disallowed with default 50)
    expect(result.monthlyLimit).toBe(100);
    expect(result.isAllowed).toBe(true);
  });

  it('falls back to DB default when env var is invalid (NaN)', async () => {
    process.env.AI_LIMIT_FREE = 'not-a-number';

    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 25, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'gemini-2.0-flash');

    // Falls back to default free limit of 50
    expect(result.monthlyLimit).toBe(50);
    expect(result.isAllowed).toBe(true);
  });

  it('uses AI_LIMIT_TEAM env var for team tier', async () => {
    process.env.AI_LIMIT_TEAM = '1000';

    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 150, tier: 'team' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'gemini-2.0-flash');

    expect(result.monthlyLimit).toBe(1000);
    expect(result.tier).toBe('team');
    expect(result.isAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getQuota
// ---------------------------------------------------------------------------

describe('getQuota', () => {
  it('returns correct QuotaInfo structure', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ used: 12, tier: 'pro', resets_at: '2026-04-01T00:00:00Z' }],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(mockRpc).toHaveBeenCalledWith('get_ai_quota', {
      p_user_id: 'user-456',
    });
    expect(result).toEqual({
      used: 12,
      limit: 500,
      remaining: 488,
      tier: 'pro',
      resetsAt: '2026-04-01T00:00:00Z',
    });
  });

  it('clamps remaining to 0 (never negative)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ used: 999, tier: 'free', resets_at: '2026-04-01T00:00:00Z' }],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(result.remaining).toBe(0);
    expect(result.used).toBe(999);
    expect(result.limit).toBe(50);
  });

  it('applies env var override to displayed limit', async () => {
    process.env.AI_LIMIT_FREE = '75';

    mockRpc.mockResolvedValueOnce({
      data: [{ used: 20, tier: 'free', resets_at: '2026-04-01T00:00:00Z' }],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(result.limit).toBe(75);
    expect(result.remaining).toBe(55); // 75 - 20
  });
});
