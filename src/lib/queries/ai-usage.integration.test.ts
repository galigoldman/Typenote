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

beforeAll(async () => {
  supabase = createAdminClient();

  // Clean up any existing ai_usage rows for the test user today
  // (seed.sql inserts a row with query_count=3 for CURRENT_DATE)
  await supabase
    .from('ai_usage')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('usage_date', new Date().toISOString().slice(0, 10));

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
    .eq('usage_date', new Date().toISOString().slice(0, 10));

  // Reset tier back to 'free'
  await supabase
    .from('profiles')
    .update({ subscription_tier: 'free' })
    .eq('id', TEST_USER_ID);
});

describe('increment_ai_usage', () => {
  it('creates a new row on first call of the day (current_count=1, is_allowed=true)', async () => {
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
      daily_limit: 30,
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
      .eq('usage_date', new Date().toISOString().slice(0, 10))
      .single();

    expect(error).toBeNull();
    expect(data!.last_model).toBe('gemini-2.0-pro');
  });

  it('returns is_allowed=false when count exceeds limit (free tier = 30)', async () => {
    // Current count is 3 from previous tests. Set it to 30 directly
    // so the next increment pushes it to 31 (which exceeds the limit).
    await supabase
      .from('ai_usage')
      .update({ query_count: 30 })
      .eq('user_id', TEST_USER_ID)
      .eq('usage_date', new Date().toISOString().slice(0, 10));

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.current_count).toBe(31);
    expect(row!.is_allowed).toBe(false);
    expect(row!.daily_limit).toBe(30);
  });
});

describe('get_ai_quota', () => {
  it('returns used=0 when no row exists for today', async () => {
    // Delete today's row so get_ai_quota sees nothing
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_date', new Date().toISOString().slice(0, 10));

    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.used).toBe(0);
    expect(row!.tier).toBe('free');
    expect(row!.daily_limit).toBe(30);
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

  it('returns the correct resets_at (next midnight UTC)', async () => {
    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;

    // resets_at should be the start of the next UTC day
    const resetsAt = new Date(row!.resets_at);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    // Compare date components — the DB returns next midnight UTC
    expect(resetsAt.getUTCFullYear()).toBe(tomorrow.getUTCFullYear());
    expect(resetsAt.getUTCMonth()).toBe(tomorrow.getUTCMonth());
    expect(resetsAt.getUTCDate()).toBe(tomorrow.getUTCDate());
    expect(resetsAt.getUTCHours()).toBe(0);
    expect(resetsAt.getUTCMinutes()).toBe(0);
    expect(resetsAt.getUTCSeconds()).toBe(0);
  });
});

describe('subscription tiers', () => {
  it('default tier is free with limit 30', async () => {
    // Ensure tier is free (set in beforeAll, but verify)
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', TEST_USER_ID)
      .single();

    expect(profile!.subscription_tier).toBe('free');

    // Clean up today's usage so we get a fresh increment
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_date', new Date().toISOString().slice(0, 10));

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.tier).toBe('free');
    expect(row!.daily_limit).toBe(30);
  });

  it('changing user tier to pro changes the limit to 100', async () => {
    // Update user to pro tier
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ subscription_tier: 'pro' })
      .eq('id', TEST_USER_ID);

    expect(updateError).toBeNull();

    // Clean up today's usage for a fresh test
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_date', new Date().toISOString().slice(0, 10));

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
    expect(incRow!.daily_limit).toBe(100);
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
    expect(quotaRow!.daily_limit).toBe(100);
  });
});
