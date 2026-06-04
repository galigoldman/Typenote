import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const OWNED_B = 'c0000000-0000-0000-0000-000000000160';
const SHARED_A = 'c0000000-0000-0000-0000-000000000161';

async function cleanup() {
  await admin.from('course_members').delete().in('course_id', [SHARED_A]);
  await admin.from('courses').delete().in('id', [OWNED_B, SHARED_A]);
}

describe('owner-scoped vs shared-with-me course queries', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin.from('courses').insert([
      { id: OWNED_B, user_id: TEST_USER_B.id, name: 'B owns' },
      { id: SHARED_A, user_id: TEST_USER_A.id, name: 'A shares with B' },
    ]);
    await admin.from('course_members').insert({
      course_id: SHARED_A,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
  });
  afterAll(cleanup);

  it('owner-scoped query (user_id filter) returns only B-owned root courses', async () => {
    const { data } = await clientB
      .from('courses')
      .select('id')
      .eq('user_id', TEST_USER_B.id)
      .is('folder_id', null);
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(OWNED_B);
    expect(ids).not.toContain(SHARED_A);
  });

  it('shared-with-me query returns A-shared course (role viewer) but not B-owned', async () => {
    const { getSharedWithMe } = await import('@/lib/queries/shared-courses');
    const courses = await getSharedWithMe(clientB, TEST_USER_B.id);
    const shared = courses.find((c) => c.id === SHARED_A);
    expect(shared).toBeTruthy();
    expect(shared!.member_role).toBe('viewer');
    expect(courses.some((c) => c.id === OWNED_B)).toBe(false);
  });
});
