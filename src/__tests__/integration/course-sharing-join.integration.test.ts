import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000060';
const TOKEN_ACTIVE = 'join-tok-active-60';
const TOKEN_OFF = 'join-tok-inactive-60';

async function cleanup() {
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('course_share_links').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('join_course_via_link', () => {
  let clientA: SupabaseClient; // owner
  let clientB: SupabaseClient; // joiner
  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    // Set is_active explicitly on BOTH rows: PostgREST sends an explicit NULL
    // for a field omitted in one row of a heterogeneous array insert, which
    // would violate the NOT NULL on is_active. Being explicit keeps the schema
    // clean (no need to relax NOT NULL).
    await admin.from('course_share_links').insert([
      {
        course_id: COURSE,
        token: TOKEN_ACTIVE,
        role: 'contributor',
        is_active: true,
      },
      { course_id: COURSE, token: TOKEN_OFF, role: 'viewer', is_active: false },
    ]);
  });
  afterAll(cleanup);

  it('B joins via active token as contributor', async () => {
    const { data, error } = await clientB.rpc('join_course_via_link', {
      p_token: TOKEN_ACTIVE,
    });
    expect(error).toBeNull();
    expect(data).toBe(COURSE);
    const { data: m } = await admin
      .from('course_members')
      .select('role')
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id)
      .single();
    expect(m!.role).toBe('contributor');
  });

  it('re-join is idempotent (no error, single row)', async () => {
    const { error } = await clientB.rpc('join_course_via_link', {
      p_token: TOKEN_ACTIVE,
    });
    expect(error).toBeNull();
    const { count } = await admin
      .from('course_members')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id);
    expect(count).toBe(1);
  });

  it('owner self-join is a no-op returning the course id', async () => {
    const { data, error } = await clientA.rpc('join_course_via_link', {
      p_token: TOKEN_ACTIVE,
    });
    expect(error).toBeNull();
    expect(data).toBe(COURSE);
    const { count } = await admin
      .from('course_members')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_A.id);
    expect(count).toBe(0); // owner never added as member
  });

  it('inactive token raises', async () => {
    const { error } = await clientB.rpc('join_course_via_link', {
      p_token: TOKEN_OFF,
    });
    expect(error).not.toBeNull();
  });
});
