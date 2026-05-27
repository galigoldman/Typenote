import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run server actions as member B.
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_B } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_B) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000110';
const PF_B = 'f0000000-0000-0000-0000-00000000011b';
const NOTE_B = 'd0000000-0000-0000-0000-00000000011b';

async function cleanup() {
  await admin.from('personal_files').delete().eq('course_id', COURSE);
  await admin.from('documents').delete().eq('id', NOTE_B);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('leaveCourse (member B)', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
    await admin.from('personal_files').insert({
      id: PF_B,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      category: 'material',
      file_name: 'b.pdf',
      display_name: 'b',
      mime_type: 'application/pdf',
      file_size: 10,
      storage_path: `${TEST_USER_B.id}/${COURSE}/b.pdf`,
    });
    await admin.from('documents').insert({
      id: NOTE_B,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      title: 'B note',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });
  });
  afterAll(cleanup);

  it('deletes B contributed files, unfiles B notes, drops membership; course intact', async () => {
    const { leaveCourse } = await import('../course-sharing');
    await leaveCourse(COURSE);

    const { data: file } = await admin
      .from('personal_files')
      .select('id')
      .eq('id', PF_B);
    expect(file ?? []).toHaveLength(0); // file removed

    const { data: note } = await admin
      .from('documents')
      .select('course_id')
      .eq('id', NOTE_B)
      .single();
    expect(note!.course_id).toBeNull(); // note kept, unfiled

    const { data: mem } = await admin
      .from('course_members')
      .select('id')
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id);
    expect(mem ?? []).toHaveLength(0); // membership gone

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('id', COURSE);
    expect(course).toHaveLength(1); // course persists for owner
  });
});
