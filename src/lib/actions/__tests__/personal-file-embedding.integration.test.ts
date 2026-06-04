import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// personal_file embedding access scoping.
//
// As of the course-sharing feature (migration 20260526130000), match_embeddings
// no longer filters by the match_user_id PARAMETER — access is gated by RLS on
// content_embeddings. So this test exercises the RPC through RLS-scoped USER
// clients (not the admin client, which bypasses RLS): the owner sees their own
// embedding; a non-member sees nothing.
const admin = createAdminClient();
const COURSE = '00000000-0000-0000-0000-0000000000aa';
const SRC = '00000000-0000-0000-0000-0000000000c1';
const vec = (n: number) => JSON.stringify(Array(1536).fill(n));

describe('personal_file embedding access scoping (RLS-gated)', () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    clientB = await createUserClient(TEST_USER_B);
    await admin.from('content_embeddings').delete().eq('source_id', SRC);
    const { error } = await admin.from('content_embeddings').insert({
      source_type: 'personal_file',
      source_id: SRC,
      segment_index: 0,
      segment_text: 'secret note',
      embedding: vec(0.01),
      user_id: TEST_USER_A.id,
      course_id: COURSE,
      source_name: 'a.pdf',
    });
    expect(error).toBeNull();
  });
  afterAll(async () => {
    await admin.from('content_embeddings').delete().eq('source_id', SRC);
  });

  it('owner (A) retrieves their own personal_file embedding', async () => {
    const { data } = await clientA.rpc('match_embeddings', {
      query_embedding: vec(0.01),
      match_user_id: TEST_USER_A.id,
      match_course_id: COURSE,
      match_count: 8,
      similarity_threshold: 0,
    });
    expect(
      (data ?? []).some((r: { source_id: string }) => r.source_id === SRC),
    ).toBe(true);
  });

  it("non-member B cannot retrieve A's personal_file embedding", async () => {
    const { data } = await clientB.rpc('match_embeddings', {
      query_embedding: vec(0.01),
      match_user_id: TEST_USER_B.id,
      match_course_id: COURSE,
      match_count: 8,
      similarity_threshold: 0,
    });
    expect(
      (data ?? []).some((r: { source_id: string }) => r.source_id === SRC),
    ).toBe(false);
  });
});
