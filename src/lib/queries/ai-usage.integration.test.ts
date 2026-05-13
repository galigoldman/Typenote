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

/**
 * The whole point of doing rate-limit accounting in a Postgres RPC (instead of
 * read-modify-write in app code) is atomicity under concurrent requests. These
 * tests assert that property end-to-end: fire N parallel increments, verify
 * every increment lands, and that the counts returned are the contiguous
 * sequence {start+1, …, start+N} with no duplicates and no gaps.
 *
 * Without this, a regression that loses the atomic upsert (e.g. someone
 * rewrites the function as SELECT…UPDATE) could let two simultaneous requests
 * both read the same starting count, both write count+1, and silently lose an
 * increment. Every existing test that calls the RPC sequentially would still
 * pass.
 */
describe('increment_ai_usage — concurrency / atomicity', () => {
  beforeAll(async () => {
    // Reset to a clean slate before this describe runs (other describes left state).
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('id', TEST_USER_ID);
  });

  it('10 concurrent increments produce 10 distinct counts {1..10} (no lost updates)', async () => {
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        supabase.rpc('increment_ai_usage', {
          p_user_id: TEST_USER_ID,
          p_model: 'flash',
          p_query_type: 'chat',
        }),
      ),
    );

    // No request errored.
    for (const { error } of results) {
      expect(error).toBeNull();
    }

    const counts = results
      .map(({ data }) => (Array.isArray(data) ? data[0] : data))
      .map((row) => row!.current_count as number)
      .sort((a, b) => a - b);

    // Each concurrent call should have observed a unique, contiguous count.
    // If two calls had collapsed, one count would be missing and another
    // would repeat.
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Stored count matches.
    const { data: row } = await supabase
      .from('ai_usage')
      .select('query_count')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('query_type', 'chat')
      .single();
    expect(row!.query_count).toBe(N);
  });

  it('concurrent burst at the quota boundary marks exactly the over-limit calls as not-allowed', async () => {
    // Seed the row right below the free-tier limit (50).
    await supabase.from('ai_usage').upsert(
      {
        user_id: TEST_USER_ID,
        usage_month: currentMonth(),
        query_type: 'chat',
        query_count: 48,
        last_model: 'flash',
      },
      { onConflict: 'user_id,usage_month,query_type' },
    );

    // Fire 5 concurrent calls. 48 → 49, 50, 51, 52, 53. Expected:
    //   counts 49 and 50 → is_allowed=true (≤ 50)
    //   counts 51, 52, 53 → is_allowed=false
    const N = 5;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        supabase.rpc('increment_ai_usage', {
          p_user_id: TEST_USER_ID,
          p_model: 'flash',
          p_query_type: 'chat',
        }),
      ),
    );

    for (const { error } of results) {
      expect(error).toBeNull();
    }

    const rows = results
      .map(({ data }) => (Array.isArray(data) ? data[0] : data))
      .map((r) => ({
        count: r!.current_count as number,
        allowed: r!.is_allowed as boolean,
      }))
      .sort((a, b) => a.count - b.count);

    expect(rows.map((r) => r.count)).toEqual([49, 50, 51, 52, 53]);
    expect(rows.map((r) => r.allowed)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);

    // Final stored count is exactly 53 — no lost updates under contention.
    const { data: row } = await supabase
      .from('ai_usage')
      .select('query_count')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('query_type', 'chat')
      .single();
    expect(row!.query_count).toBe(53);
  });

  it('parallel chat + latex increments do not collide (independent counters)', async () => {
    // Reset to keep this test deterministic.
    await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const N_CHAT = 6;
    const N_LATEX = 4;

    const calls = [
      ...Array.from({ length: N_CHAT }, () =>
        supabase.rpc('increment_ai_usage', {
          p_user_id: TEST_USER_ID,
          p_model: 'flash',
          p_query_type: 'chat',
        }),
      ),
      ...Array.from({ length: N_LATEX }, () =>
        supabase.rpc('increment_ai_usage', {
          p_user_id: TEST_USER_ID,
          p_model: 'flash',
          p_query_type: 'latex',
        }),
      ),
    ];

    const results = await Promise.all(calls);
    for (const { error } of results) {
      expect(error).toBeNull();
    }

    const { data: chatRow } = await supabase
      .from('ai_usage')
      .select('query_count')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('query_type', 'chat')
      .single();
    const { data: latexRow } = await supabase
      .from('ai_usage')
      .select('query_count')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('query_type', 'latex')
      .single();

    expect(chatRow!.query_count).toBe(N_CHAT);
    expect(latexRow!.query_count).toBe(N_LATEX);
  });
});
