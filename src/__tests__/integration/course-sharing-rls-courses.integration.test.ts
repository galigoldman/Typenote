import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const SHARED = 'c0000000-0000-0000-0000-000000000030';
const PRIVATE = 'c0000000-0000-0000-0000-000000000031';

async function cleanup() {
  await admin
    .from('course_members')
    .delete()
    .in('course_id', [SHARED, PRIVATE]);
  await admin.from('courses').delete().in('id', [SHARED, PRIVATE]);
}

describe('RLS: courses + course_members visibility', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin.from('courses').insert([
      { id: SHARED, user_id: TEST_USER_A.id, name: 'Shared by A' },
      { id: PRIVATE, user_id: TEST_USER_A.id, name: 'Private A' },
    ]);
    await admin.from('course_members').insert({
      course_id: SHARED,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
  });
  afterAll(cleanup);

  it('member B can SELECT the shared course', async () => {
    const { data } = await clientB
      .from('courses')
      .select('id')
      .eq('id', SHARED);
    expect(data).toHaveLength(1);
  });

  it('non-member B cannot SELECT the private course', async () => {
    const { data } = await clientB
      .from('courses')
      .select('id')
      .eq('id', PRIVATE);
    expect(data ?? []).toHaveLength(0);
  });

  it('member B sees the roster of the shared course', async () => {
    const { data } = await clientB
      .from('course_members')
      .select('user_id, role')
      .eq('course_id', SHARED);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('member B cannot update the shared course (owner-only)', async () => {
    await clientB.from('courses').update({ name: 'hacked' }).eq('id', SHARED);
    const { data } = await admin
      .from('courses')
      .select('name')
      .eq('id', SHARED)
      .single();
    expect(data!.name).toBe('Shared by A');
  });
});
