import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run deleteCourse as owner A.
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_A } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_A) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000130';
const PF_B = 'f0000000-0000-0000-0000-00000000013b';
const NOTE_B = 'd0000000-0000-0000-0000-00000000013b';

async function cleanup() {
  await admin.from('personal_files').delete().eq('course_id', COURSE);
  await admin.from('documents').delete().eq('id', NOTE_B);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('deleteCourse on a shared course (owner A)', () => {
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

  it("deletes contributors' files but preserves members' notes (unfiled)", async () => {
    const { deleteCourse } = await import('../courses');
    await deleteCourse(COURSE);

    const { data: file } = await admin
      .from('personal_files')
      .select('id')
      .eq('id', PF_B);
    expect(file ?? []).toHaveLength(0); // contributor's file gone

    const { data: note } = await admin
      .from('documents')
      .select('course_id')
      .eq('id', NOTE_B)
      .single();
    expect(note!.course_id).toBeNull(); // member's note survives, unfiled

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('id', COURSE);
    expect(course ?? []).toHaveLength(0); // course gone
  });
});
