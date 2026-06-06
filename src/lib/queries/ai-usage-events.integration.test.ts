import { describe, it, expect } from 'vitest';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

// Seeded test user (see supabase/seed.sql).
const TEST_USER = TEST_USER_ID;

describe('ai_usage_events insert', () => {
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
