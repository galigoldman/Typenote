import { describe, it, expect } from 'vitest';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

// Seeded test user (see supabase/seed.sql).
const TEST_USER = TEST_USER_ID;

describe('ai_usage_events insert', () => {
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
