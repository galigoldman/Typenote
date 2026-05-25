import { describe, it, expect } from 'vitest';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

const admin = createAdminClient();
const vec = (n: number) => JSON.stringify(Array(1536).fill(n));

describe('flatten migration schema', () => {
  it('course_weeks no longer exists', async () => {
    const { error } = await admin.from('course_weeks').select('id').limit(1);
    expect(error?.message ?? '').toMatch(
      /does not exist|could not find|schema cache/i,
    );
  });

  it('course_materials has course_id, not week_id', async () => {
    const ok = await admin
      .from('course_materials')
      .select('id, course_id')
      .limit(1);
    expect(ok.error).toBeNull();
    const bad = await admin.from('course_materials').select('week_id').limit(1);
    expect(bad.error?.message ?? '').toMatch(/week_id/i);
  });

  it('rejects a course_material embedding with null user_id', async () => {
    const { error } = await admin.from('content_embeddings').insert({
      source_type: 'course_material',
      source_id: '00000000-0000-0000-0000-000000000001',
      segment_index: 0,
      embedding: vec(0),
      user_id: null,
      course_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(error?.message ?? '').toMatch(/owned_user_not_null|violates check/i);
  });

  it('match_embeddings no longer accepts match_week_id', async () => {
    const { error } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0),
      match_user_id: TEST_USER_ID,
      match_week_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(error?.message ?? '').toMatch(/match_week_id|does not exist/i);
  });
});
