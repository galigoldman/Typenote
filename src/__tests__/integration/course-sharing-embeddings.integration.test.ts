import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000050';
const SRC = 'f0000000-0000-0000-0000-000000000050'; // A's personal_file id

// 1536-dim vector with a single 1 so cosine distance is well-defined.
const vec = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));

async function cleanup() {
  await admin.from('content_embeddings').delete().eq('source_id', SRC);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('shared embeddings + match_embeddings for members', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.from('content_embeddings').insert({
      source_type: 'personal_file',
      source_id: SRC,
      segment_index: 0,
      segment_text: 'shared lecture content',
      embedding: JSON.stringify(vec),
      user_id: TEST_USER_A.id, // uploaded by A
      course_id: COURSE,
      source_name: 'lecture.pdf',
      mime_type: 'application/pdf',
    });
  });
  afterAll(cleanup);

  it('member B can SELECT A-owned embeddings for a shared course', async () => {
    const { data } = await clientB
      .from('content_embeddings')
      .select('id')
      .eq('source_id', SRC);
    expect(data).toHaveLength(1);
  });

  it('match_embeddings returns A-owned shared rows to member B', async () => {
    const { data, error } = await clientB.rpc('match_embeddings', {
      query_embedding: JSON.stringify(vec),
      match_user_id: TEST_USER_B.id,
      match_course_id: COURSE,
      match_count: 8,
      similarity_threshold: 0.1,
    });
    expect(error).toBeNull();
    expect(
      (data ?? []).some((r: { source_id: string }) => r.source_id === SRC),
    ).toBe(true);
  });
});
