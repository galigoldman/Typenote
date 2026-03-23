/**
 * Integration test: verifies the increment_ai_usage and get_ai_quota
 * RPC functions work against the real database.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * This tests the database layer itself — the atomic upsert, tier-based
 * limits, and quota read logic defined in 00016/00018 migrations.
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
      p_query_type: 'chat',
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
      p_query_type: 'chat',
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
      p_query_type: 'chat',
    });

    const { data, error } = await supabase
      .from('ai_usage')
      .select('last_model')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('query_type', 'chat')
      .single();

    expect(error).toBeNull();
    expect(data!.last_model).toBe('gemini-2.0-pro');
  });

  it('returns is_allowed=false when count exceeds limit (free tier = 50)', async () => {
    await supabase
      .from('ai_usage')
      .update({ query_count: 50 })
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('query_type', 'chat');

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_query_type: 'chat',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.current_count).toBe(51);
    expect(row!.is_allowed).toBe(false);
    expect(row!.monthly_limit).toBe(50);
  });

  it('tracks latex queries independently from chat', async () => {
    // Chat is at 51 from previous test. LaTeX should start fresh at 1.
    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_query_type: 'latex',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.current_count).toBe(1);
    expect(row!.is_allowed).toBe(true);
    expect(row!.monthly_limit).toBe(150); // free tier latex limit
  });

  it('uses beta tier limits for chat (100) and latex (500)', async () => {
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'beta' })
      .eq('id', TEST_USER_ID);

    // Clean up
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data: chatData } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_query_type: 'chat',
    });
    const chatRow = Array.isArray(chatData) ? chatData[0] : chatData;
    expect(chatRow!.monthly_limit).toBe(100);
    expect(chatRow!.tier).toBe('beta');

    const { data: latexData } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_query_type: 'latex',
    });
    const latexRow = Array.isArray(latexData) ? latexData[0] : latexData;
    expect(latexRow!.monthly_limit).toBe(500);

    // Reset back to free
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('id', TEST_USER_ID);
  });
});

describe('get_ai_quota', () => {
  it('returns per-type rows with used=0 when no usage exists', async () => {
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const rows = Array.isArray(data) ? data : [data];
    expect(rows).toHaveLength(2);

    const chatRow = rows.find(
      (r: { query_type: string }) => r.query_type === 'chat',
    );
    const latexRow = rows.find(
      (r: { query_type: string }) => r.query_type === 'latex',
    );

    expect(chatRow!.used).toBe(0);
    expect(chatRow!.monthly_limit).toBe(50);
    expect(chatRow!.tier).toBe('free');
    expect(latexRow!.used).toBe(0);
    expect(latexRow!.monthly_limit).toBe(150);
  });

  it('returns correct count after several increments', async () => {
    for (let i = 0; i < 5; i++) {
      await supabase.rpc('increment_ai_usage', {
        p_user_id: TEST_USER_ID,
        p_model: 'flash',
        p_query_type: 'chat',
      });
    }
    for (let i = 0; i < 3; i++) {
      await supabase.rpc('increment_ai_usage', {
        p_user_id: TEST_USER_ID,
        p_model: 'flash',
        p_query_type: 'latex',
      });
    }

    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const rows = Array.isArray(data) ? data : [data];
    const chatRow = rows.find(
      (r: { query_type: string }) => r.query_type === 'chat',
    );
    const latexRow = rows.find(
      (r: { query_type: string }) => r.query_type === 'latex',
    );

    expect(chatRow!.used).toBe(5);
    expect(latexRow!.used).toBe(3);
  });

  it('returns the correct resets_at (first of next month UTC)', async () => {
    const { data, error } = await supabase.rpc('get_ai_quota', {
      p_user_id: TEST_USER_ID,
    });

    expect(error).toBeNull();

    const rows = Array.isArray(data) ? data : [data];
    const resetsAt = new Date(rows[0].resets_at);
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
  });
});

describe('subscription tiers', () => {
  it('default tier is free with limit 50', async () => {
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('id', TEST_USER_ID);

    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_query_type: 'chat',
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row!.tier).toBe('free');
    expect(row!.monthly_limit).toBe(50);
  });

  it('changing user tier to pro changes the limit to 500', async () => {
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'pro' })
      .eq('id', TEST_USER_ID);

    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const { data: incData, error: incError } = await supabase.rpc(
      'increment_ai_usage',
      {
        p_user_id: TEST_USER_ID,
        p_model: 'flash',
        p_query_type: 'chat',
      },
    );

    expect(incError).toBeNull();

    const incRow = Array.isArray(incData) ? incData[0] : incData;
    expect(incRow!.tier).toBe('pro');
    expect(incRow!.monthly_limit).toBe(500);
    expect(incRow!.is_allowed).toBe(true);

    const { data: quotaData, error: quotaError } = await supabase.rpc(
      'get_ai_quota',
      { p_user_id: TEST_USER_ID },
    );

    expect(quotaError).toBeNull();

    const rows = Array.isArray(quotaData) ? quotaData : [quotaData];
    const chatRow = rows.find(
      (r: { query_type: string }) => r.query_type === 'chat',
    );
    expect(chatRow!.tier).toBe('pro');
    expect(chatRow!.monthly_limit).toBe(500);
  });
});
