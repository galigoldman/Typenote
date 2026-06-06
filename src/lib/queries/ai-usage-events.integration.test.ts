import { afterEach, describe, it, expect } from 'vitest';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

// Seeded test user (see supabase/seed.sql).
const TEST_USER = TEST_USER_ID;

describe('ai_usage_events insert', () => {
  afterEach(async () => {
    // Remove only the rows written by this test suite (identified by specific
    // input_tokens values). Scoped to created_at < 2090 to spare the far-future
    // 2099 seed sentinel rows the admin E2E depends on.
    const admin = createAdminClient();
    await admin
      .from('ai_usage_events')
      .delete()
      .eq('user_id', TEST_USER)
      .in('input_tokens', [777, 111])
      .lt('created_at', '2090-01-01');
  });

  it('recordAiEvent writes a row through the real (service-role) path', async () => {
    const { recordAiEvent } = await import('@/lib/ai/usage-events');
    await recordAiEvent({
      userId: TEST_USER,
      queryType: 'latex',
      model: 'flash',
      inputTokens: 777,
      outputTokens: 33,
    });

    const admin = createAdminClient();
    const { data } = await admin
      .from('ai_usage_events')
      .select('input_tokens, output_tokens, query_type, model')
      .eq('user_id', TEST_USER)
      .eq('input_tokens', 777)
      .single();

    expect(data).toMatchObject({
      input_tokens: 777,
      output_tokens: 33,
      query_type: 'latex',
      model: 'flash',
    });
  });

  it('persists a row readable by the admin client', async () => {
    const admin = createAdminClient();
    const { error } = await admin.from('ai_usage_events').insert({
      user_id: TEST_USER,
      query_type: 'chat',
      model: 'flash',
      input_tokens: 111,
      output_tokens: 22,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('ai_usage_events')
      .select('input_tokens, output_tokens, query_type, model')
      .eq('user_id', TEST_USER)
      .eq('input_tokens', 111)
      .single();

    expect(data).toMatchObject({
      input_tokens: 111,
      output_tokens: 22,
      query_type: 'chat',
      model: 'flash',
    });
  });
});
