import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient, TEST_USER_A, TEST_USER_B } from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = '00000000-0000-0000-0000-0000000000aa';
const SRC = '00000000-0000-0000-0000-0000000000c1';
const vec = (n: number) => JSON.stringify(Array(1536).fill(n));

describe('personal_file per-user embedding scoping', () => {
  beforeAll(async () => {
    await admin.from('content_embeddings').delete().eq('source_id', SRC);
    const { error } = await admin.from('content_embeddings').insert({
      source_type: 'personal_file', source_id: SRC, segment_index: 0,
      segment_text: 'secret note', embedding: vec(0.01),
      user_id: TEST_USER_A.id, course_id: COURSE, source_name: 'a.pdf',
    });
    expect(error).toBeNull();
  });
  afterAll(async () => { await admin.from('content_embeddings').delete().eq('source_id', SRC); });

  it('owner (A) retrieves the personal_file', async () => {
    const { data } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0.01), match_user_id: TEST_USER_A.id,
      match_course_id: COURSE, match_count: 8, similarity_threshold: 0,
    });
    expect((data ?? []).some((r: { source_id: string }) => r.source_id === SRC)).toBe(true);
  });

  it("other user (B) cannot retrieve A's personal_file", async () => {
    const { data } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0.01), match_user_id: TEST_USER_B.id,
      match_course_id: COURSE, match_count: 8, similarity_threshold: 0,
    });
    expect((data ?? []).some((r: { source_id: string }) => r.source_id === SRC)).toBe(false);
  });
});
