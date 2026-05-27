import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000080';
const PF = 'f0000000-0000-0000-0000-000000000080';
const PATH = `${TEST_USER_A.id}/${COURSE}/shared.pdf`;

async function cleanup() {
  await admin.storage.from('personal-files').remove([PATH]);
  await admin.from('personal_files').delete().eq('id', PF);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('storage RLS: members can read shared files', () => {
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
    await admin.storage
      .from('personal-files')
      .upload(PATH, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      });
    await admin.from('personal_files').insert({
      id: PF,
      user_id: TEST_USER_A.id,
      course_id: COURSE,
      category: 'material',
      file_name: 'shared.pdf',
      display_name: 'shared',
      mime_type: 'application/pdf',
      file_size: 13,
      storage_path: PATH,
    });
  });
  afterAll(cleanup);

  it('member B can create a signed URL for an A-owned shared file', async () => {
    const { data, error } = await clientB.storage
      .from('personal-files')
      .createSignedUrl(PATH, 3600);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });
});
