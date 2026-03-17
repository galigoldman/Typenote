/**
 * Integration test: verifies the increment_ai_usage and get_ai_quota
 * RPC functions work against the real database.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * This tests the database layer itself — the atomic upsert, tier-based
 * limits, and quota read logic defined in 00016_ai_rate_limiting.sql.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

/** Current month as 'YYYY-MM' — matches the DB's to_char(CURRENT_DATE, 'YYYY-MM') */
function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

beforeAll(async () => {
  supabase = createAdminClient();

  // Clean up any existing ai_usage rows for the test user this month
  await supabase
    .from('ai_usage')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('usage_month', currentMonth());

  // Ensure the test user starts on the 'free' tier
  await supabase
    .from('profiles')
    .update({ subscription_tier: 'free' })
    .eq('id', TEST_USER_ID);
});

afterAll(async () => {
  // Clean up ai_usage rows created during tests
  await supabase
    .from('ai_usage')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('usage_month', currentMonth());

  // Reset tier back to 'free'
  await supabase
    .from('profiles')
    .update({ subscription_tier: 'free' })
    .eq('id', TEST_USER_ID);
});

describe('increment_ai_usage', () => {
  it('creates a new row on first call of the month (current_count=1, is_allowed=true)', async () => {
    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toMatchObject({
      current_count: 1,
      is_allowed: true,
      tier: 'free',
      monthly_limit: 50,
    });
  });

  it('increments existing row on subsequent calls', async () => {
    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.current_count).toBe(2);
    expect(row!.is_allowed).toBe(true);
  });

  it('records the model parameter (last_model)', async () => {
    await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'gemini-2.0-pro',
    });

    const { data, error } = await supabase
      .from('ai_usage')
      .select('last_model')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .single();

    expect(error).toBeNull();
    expect(data!.last_model).toBe('gemini-2.0-pro');
  });

  it('returns is_allowed=false when count exceeds limit (free tier = 50)', async () => {
    // Current count is 3 from previous tests. Set it to 50 directly
    // so the next increment pushes it to 51 (which exceeds the limit).
    await supabase
      .from('ai_usage')
      .update({ query_count: 50 })
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.current_count).toBe(51);
    expect(row!.is_allowed).toBe(false);
    expect(row!.monthly_limit).toBe(50);
  });
});

describe('get_ai_quota', () => {
  it('returns used=0 when no row exists for this month', async () => {
    // Delete this month's row so get_ai_quota sees nothing
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.used).toBe(0);
    expect(row!.tier).toBe('free');
    expect(row!.monthly_limit).toBe(50);
  });

  it('returns correct count after several increments', async () => {
    // Increment 5 times
    for (let i = 0; i < 5; i++) {
      await supabase.rpc('increment_ai_usage', {
        p_user_id: TEST_USER_ID,
        p_model: 'flash',
      });
    }

    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.used).toBe(5);
  });

  it('returns the correct resets_at (first of next month UTC)', async () => {
    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;

    // resets_at should be the first day of the next month at midnight UTC
    const resetsAt = new Date(row!.resets_at);
    const now = new Date();
    const expectedMonth = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
    const expectedYear =
      now.getUTCMonth() === 11
        ? now.getUTCFullYear() + 1
        : now.getUTCFullYear();

    expect(resetsAt.getUTCFullYear()).toBe(expectedYear);
    expect(resetsAt.getUTCMonth()).toBe(expectedMonth);
    expect(resetsAt.getUTCDate()).toBe(1);
    expect(resetsAt.getUTCHours()).toBe(0);
    expect(resetsAt.getUTCMinutes()).toBe(0);
  });
});

describe('subscription tiers', () => {
  it('default tier is free with limit 50', async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', TEST_USER_ID)
      .single();

    expect(profile!.subscription_tier).toBe('free');

    // Clean up this month's usage for a fresh increment
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.tier).toBe('free');
    expect(row!.monthly_limit).toBe(50);
  });

  it('changing user tier to pro changes the limit to 500', async () => {
    // Update user to pro tier
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ subscription_tier: 'pro' })
      .eq('id', TEST_USER_ID);

    expect(updateError).toBeNull();

    // Clean up this month's usage for a fresh test
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    // Verify increment reflects pro tier
    const { data: incData, error: incError } = await supabase.rpc(
      'increment_ai_usage',
      {
        p_user_id: TEST_USER_ID,
        p_model: 'flash',
      },
    );

    expect(incError).toBeNull();

    const incRow = Array.isArray(incData) ? incData[0] : incData;
    expect(incRow!.tier).toBe('pro');
    expect(incRow!.monthly_limit).toBe(500);
    expect(incRow!.is_allowed).toBe(true);

    // Verify get_ai_quota also reflects pro tier
    const { data: quotaData, error: quotaError } = await supabase.rpc(
      'get_ai_quota',
      {
        p_user_id: TEST_USER_ID,
      },
    );

    expect(quotaError).toBeNull();

    const quotaRow = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    expect(quotaRow!.tier).toBe('pro');
    expect(quotaRow!.monthly_limit).toBe(500);
  });
});
