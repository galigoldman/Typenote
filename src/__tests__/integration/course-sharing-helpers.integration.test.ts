import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000010';

async function cleanup() {
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('membership helper functions', () => {
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
  });
  afterAll(cleanup);

  it('is_course_member: true for member B', async () => {
    const { data, error } = await clientB.rpc('is_course_member', {
      p_course_id: COURSE,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('is_course_contributor: false for viewer B', async () => {
    const { data } = await clientB.rpc('is_course_contributor', {
      p_course_id: COURSE,
    });
    expect(data).toBe(false);
  });

  it('is_course_owner: false for member B', async () => {
    const { data } = await clientB.rpc('is_course_owner', {
      p_course_id: COURSE,
    });
    expect(data).toBe(false);
  });
});
