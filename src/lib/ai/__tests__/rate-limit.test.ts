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

import {
  checkAndIncrementUsage,
  getQuota,
  recordTokenUsage,
  resolveLimitForTier,
} from '../rate-limit';

afterEach(() => {
  vi.clearAllMocks();
  // Clean up any env var overrides
  delete process.env.AI_LIMIT_FREE;
  delete process.env.AI_LIMIT_PRO;
  delete process.env.AI_LIMIT_BETA;
  delete process.env.AI_LIMIT_TEAM;
  delete process.env.AI_LATEX_LIMIT_FREE;
  delete process.env.AI_LATEX_LIMIT_BETA;
  delete process.env.AI_LATEX_LIMIT_PRO;
});

// ---------------------------------------------------------------------------
// resolveLimitForTier
// ---------------------------------------------------------------------------

describe('resolveLimitForTier', () => {
  it('returns default chat limits per tier', () => {
    expect(resolveLimitForTier('free', 'chat')).toBe(50);
    expect(resolveLimitForTier('beta', 'chat')).toBe(100);
    expect(resolveLimitForTier('pro', 'chat')).toBe(500);
  });

  it('returns default latex limits per tier', () => {
    expect(resolveLimitForTier('free', 'latex')).toBe(150);
    expect(resolveLimitForTier('beta', 'latex')).toBe(500);
    expect(resolveLimitForTier('pro', 'latex')).toBe(1500);
  });

  it('defaults to chat when queryType omitted', () => {
    expect(resolveLimitForTier('free')).toBe(50);
  });

  it('falls back to free limit for unknown tier', () => {
    expect(resolveLimitForTier('unknown', 'chat')).toBe(50);
    expect(resolveLimitForTier('unknown', 'latex')).toBe(150);
  });

  it('uses AI_LIMIT_BETA env var override for chat', () => {
    process.env.AI_LIMIT_BETA = '200';
    expect(resolveLimitForTier('beta', 'chat')).toBe(200);
  });

  it('uses AI_LATEX_LIMIT_BETA env var override for latex', () => {
    process.env.AI_LATEX_LIMIT_BETA = '1000';
    expect(resolveLimitForTier('beta', 'latex')).toBe(1000);
  });

  it('ignores invalid env var and uses default', () => {
    process.env.AI_LIMIT_FREE = 'not-a-number';
    expect(resolveLimitForTier('free', 'chat')).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// checkAndIncrementUsage
// ---------------------------------------------------------------------------

describe('checkAndIncrementUsage', () => {
  it('calls RPC with query_type param', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 5, tier: 'free' }],
      error: null,
    });

    await checkAndIncrementUsage('user-123', 'flash', 'chat');

    expect(mockRpc).toHaveBeenCalledWith('increment_ai_usage', {
      p_user_id: 'user-123',
      p_model: 'flash',
      p_query_type: 'chat',
    });
  });

  it('defaults queryType to chat when omitted', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 5, tier: 'free' }],
      error: null,
    });

    await checkAndIncrementUsage('user-123', 'flash');

    expect(mockRpc).toHaveBeenCalledWith('increment_ai_usage', {
      p_user_id: 'user-123',
      p_model: 'flash',
      p_query_type: 'chat',
    });
  });

  it('passes latex query_type to RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 5, tier: 'beta' }],
      error: null,
    });

    await checkAndIncrementUsage('user-123', 'flash', 'latex');

    expect(mockRpc).toHaveBeenCalledWith('increment_ai_usage', {
      p_user_id: 'user-123',
      p_model: 'flash',
      p_query_type: 'latex',
    });
  });

  it('returns isAllowed=true when count <= limit for beta tier', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 100, tier: 'beta' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash', 'chat');

    expect(result).toEqual({
      currentCount: 100,
      monthlyLimit: 100,
      tier: 'beta',
      isAllowed: true,
    });
  });

  it('returns isAllowed=false when beta user exceeds chat limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 101, tier: 'beta' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash', 'chat');

    expect(result).toEqual({
      currentCount: 101,
      monthlyLimit: 100,
      tier: 'beta',
      isAllowed: false,
    });
  });

  it('uses latex limit for latex query type', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 300, tier: 'beta' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash', 'latex');

    expect(result).toEqual({
      currentCount: 300,
      monthlyLimit: 500,
      tier: 'beta',
      isAllowed: true,
    });
  });

  it('returns isAllowed=true when count <= limit (free tier)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 10, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash');

    expect(result).toEqual({
      currentCount: 10,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });
  });

  it('returns isAllowed=false when count > limit (free tier)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 51, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash');

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
      checkAndIncrementUsage('user-123', 'flash'),
    ).rejects.toThrow('Rate limit check failed: connection refused');
  });

  it('uses AI_LIMIT_FREE env var override', async () => {
    process.env.AI_LIMIT_FREE = '100';

    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 75, tier: 'free' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash');

    expect(result.monthlyLimit).toBe(100);
    expect(result.isAllowed).toBe(true);
  });

  it('uses AI_LIMIT_TEAM env var for team tier', async () => {
    process.env.AI_LIMIT_TEAM = '1000';

    mockRpc.mockResolvedValueOnce({
      data: [{ current_count: 150, tier: 'team' }],
      error: null,
    });

    const result = await checkAndIncrementUsage('user-123', 'flash');

    expect(result.monthlyLimit).toBe(1000);
    expect(result.tier).toBe('team');
    expect(result.isAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getQuota
// ---------------------------------------------------------------------------

describe('getQuota', () => {
  it('returns per-type QuotaInfo structure', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          query_type: 'chat',
          used: 42,
          tier: 'beta',
          resets_at: '2026-04-01T00:00:00Z',
        },
        {
          query_type: 'latex',
          used: 123,
          tier: 'beta',
          resets_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(mockRpc).toHaveBeenCalledWith('get_ai_quota', {
      p_user_id: 'user-456',
    });
    expect(result).toEqual({
      chat: { used: 42, limit: 100, remaining: 58 },
      latex: { used: 123, limit: 500, remaining: 377 },
      tier: 'beta',
      resetsAt: '2026-04-01T00:00:00Z',
      deepModeAvailable: false,
    });
  });

  it('deepModeAvailable is true for pro tier', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          query_type: 'chat',
          used: 12,
          tier: 'pro',
          resets_at: '2026-04-01T00:00:00Z',
        },
        {
          query_type: 'latex',
          used: 5,
          tier: 'pro',
          resets_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(result.deepModeAvailable).toBe(true);
    expect(result.chat.limit).toBe(500);
    expect(result.latex.limit).toBe(1500);
  });

  it('deepModeAvailable is false for free tier', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          query_type: 'chat',
          used: 0,
          tier: 'free',
          resets_at: '2026-04-01T00:00:00Z',
        },
        {
          query_type: 'latex',
          used: 0,
          tier: 'free',
          resets_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(result.deepModeAvailable).toBe(false);
  });

  it('clamps remaining to 0 (never negative)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          query_type: 'chat',
          used: 999,
          tier: 'free',
          resets_at: '2026-04-01T00:00:00Z',
        },
        {
          query_type: 'latex',
          used: 999,
          tier: 'free',
          resets_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(result.chat.remaining).toBe(0);
    expect(result.latex.remaining).toBe(0);
  });

  it('applies env var override to displayed limit', async () => {
    process.env.AI_LIMIT_FREE = '75';
    process.env.AI_LATEX_LIMIT_FREE = '300';

    mockRpc.mockResolvedValueOnce({
      data: [
        {
          query_type: 'chat',
          used: 20,
          tier: 'free',
          resets_at: '2026-04-01T00:00:00Z',
        },
        {
          query_type: 'latex',
          used: 50,
          tier: 'free',
          resets_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await getQuota('user-456');

    expect(result.chat.limit).toBe(75);
    expect(result.chat.remaining).toBe(55);
    expect(result.latex.limit).toBe(300);
    expect(result.latex.remaining).toBe(250);
  });

  it('throws when RPC returns error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    });

    await expect(getQuota('user-456')).rejects.toThrow(
      'Quota check failed: RPC failed',
    );
  });
});

// ---------------------------------------------------------------------------
// recordTokenUsage
// ---------------------------------------------------------------------------

describe('recordTokenUsage', () => {
  it('calls record_token_usage RPC with correct params', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    await recordTokenUsage('user-123', 'chat', 5000, 400);

    expect(mockRpc).toHaveBeenCalledWith('record_token_usage', {
      p_user_id: 'user-123',
      p_query_type: 'chat',
      p_input_tokens: 5000,
      p_output_tokens: 400,
    });
  });

  it('does not throw when RPC fails (fire-and-forget)', async () => {
    mockRpc.mockRejectedValueOnce(new Error('DB down'));

    // Should not throw
    await expect(
      recordTokenUsage('user-123', 'latex', 100, 30),
    ).resolves.toBeUndefined();
  });
});
