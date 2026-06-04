import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000040';
const PF_A = 'f0000000-0000-0000-0000-00000000004a'; // A's personal file

async function cleanup() {
  await admin.from('personal_files').delete().eq('course_id', COURSE);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

function pfRow(id: string, userId: string) {
  return {
    id,
    user_id: userId,
    course_id: COURSE,
    category: 'material',
    file_name: 'a.pdf',
    display_name: 'a',
    mime_type: 'application/pdf',
    file_size: 10,
    storage_path: `${userId}/${COURSE}/a.pdf`,
  };
}

describe('RLS: personal_files in shared course', () => {
  let userB: SupabaseClient;

  async function setViewer() {
    await admin.from('course_members').delete().eq('course_id', COURSE);
    await admin
      .from('course_members')
      .insert({ course_id: COURSE, user_id: TEST_USER_B.id, role: 'viewer' });
  }
  async function setContributor() {
    await admin.from('course_members').delete().eq('course_id', COURSE);
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
  }

  beforeAll(async () => {
    userB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('personal_files').insert(pfRow(PF_A, TEST_USER_A.id));
  });
  afterAll(cleanup);

  it('member can SELECT a file owned by another member', async () => {
    await setViewer();
    const { data } = await userB
      .from('personal_files')
      .select('id')
      .eq('id', PF_A);
    expect(data).toHaveLength(1);
  });

  it('viewer INSERT is denied', async () => {
    await setViewer();
    const { error } = await userB
      .from('personal_files')
      .insert(pfRow('f0000000-0000-0000-0000-0000000000b1', TEST_USER_B.id));
    expect(error).not.toBeNull();
  });

  it('contributor INSERT (own user_id) is allowed', async () => {
    await setContributor();
    const id = 'f0000000-0000-0000-0000-0000000000b2';
    const { error } = await userB
      .from('personal_files')
      .insert(pfRow(id, TEST_USER_B.id));
    expect(error).toBeNull();
    await admin.from('personal_files').delete().eq('id', id);
  });

  it('member cannot delete a file they did not upload; owner-uploaded file persists', async () => {
    await setContributor();
    await userB.from('personal_files').delete().eq('id', PF_A);
    const stillThere = await admin
      .from('personal_files')
      .select('id')
      .eq('id', PF_A);
    expect(stillThere.data).toHaveLength(1);
  });
});
