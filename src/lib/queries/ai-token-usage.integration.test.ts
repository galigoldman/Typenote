/**
 * Integration test: record_token_usage upserts into ai_token_usage,
 * keyed by (user, month, model), accumulating on repeat calls.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function cleanup() {
  await supabase
    .from('ai_token_usage')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('usage_month', currentMonth());
}

beforeAll(async () => {
  supabase = createAdminClient();
  await cleanup();
});

afterAll(cleanup);

describe('record_token_usage', () => {
  it('inserts a new row for a model on first call', async () => {
    const { error } = await supabase.rpc('record_token_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_input_tokens: 100,
      p_output_tokens: 40,
    });
    expect(error).toBeNull();

    const { data } = await supabase
      .from('ai_token_usage')
      .select('input_tokens, output_tokens')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('model', 'flash')
      .single();

    expect(data?.input_tokens).toBe(100);
    expect(data?.output_tokens).toBe(40);
  });

  it('accumulates on repeat calls for the same model', async () => {
    await supabase.rpc('record_token_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_input_tokens: 10,
      p_output_tokens: 5,
    });

    const { data } = await supabase
      .from('ai_token_usage')
      .select('input_tokens, output_tokens')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('model', 'flash')
      .single();

    expect(data?.input_tokens).toBe(110);
    expect(data?.output_tokens).toBe(45);
  });

  it('keeps separate models in separate rows', async () => {
    await supabase.rpc('record_token_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'embedding',
      p_input_tokens: 999,
      p_output_tokens: 0,
    });

    const { data } = await supabase
      .from('ai_token_usage')
      .select('model, input_tokens')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const embedding = data?.find((r) => r.model === 'embedding');
    expect(embedding?.input_tokens).toBe(999);
    expect(data?.length).toBe(2); // flash + embedding
  });
});
