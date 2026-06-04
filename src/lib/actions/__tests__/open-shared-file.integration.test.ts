import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run as member B.
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_B } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_B) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000140';
const PF_A = 'f0000000-0000-0000-0000-00000000014a';

async function cleanup() {
  await admin.from('documents').delete().eq('personal_file_id', PF_A);
  await admin.from('personal_files').delete().eq('id', PF_A);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('openPersonalFileAsDocument as member', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.from('personal_files').insert({
      id: PF_A,
      user_id: TEST_USER_A.id, // uploaded by owner A
      course_id: COURSE,
      category: 'material',
      file_name: 'a.pdf',
      display_name: 'a',
      mime_type: 'application/pdf',
      file_size: 10,
      storage_path: `${TEST_USER_A.id}/${COURSE}/a.pdf`,
    });
  });
  afterAll(cleanup);

  it('member B can open A-owned shared file as their own document', async () => {
    const { openPersonalFileAsDocument } = await import('../personal-files');
    const { documentId, created } = await openPersonalFileAsDocument({
      fileId: PF_A,
      pageCount: 1,
    });
    expect(documentId).toBeTruthy();
    expect(created).toBe(true);
    const { data: doc } = await admin
      .from('documents')
      .select('user_id, personal_file_id')
      .eq('id', documentId)
      .single();
    expect(doc!.user_id).toBe(TEST_USER_B.id); // B's own doc
    expect(doc!.personal_file_id).toBe(PF_A);
  });
});
