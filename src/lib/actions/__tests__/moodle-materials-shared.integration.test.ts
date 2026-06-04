import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run getMoodleMaterialsForCourse as member B (who has NO own sync).
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_B } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_B) };
});

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000150';
const INSTANCE = 'e0000000-0000-0000-0000-000000000150';
const MCOURSE = 'a0000000-0000-0000-0000-000000000150';
const SECTION = 'b0000000-0000-0000-0000-000000000150';
const MFILE = '90000000-0000-0000-0000-000000000150';
const SYNC = '80000000-0000-0000-0000-000000000150';

async function cleanup() {
  await admin.from('user_file_imports').delete().eq('moodle_file_id', MFILE);
  await admin.from('user_course_syncs').delete().eq('id', SYNC);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
  await admin.from('moodle_files').delete().eq('id', MFILE);
  await admin.from('moodle_sections').delete().eq('id', SECTION);
  await admin.from('moodle_courses').delete().eq('id', MCOURSE);
  await admin.from('moodle_instances').delete().eq('id', INSTANCE);
}

describe('getMoodleMaterialsForCourse for a member', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('moodle_instances')
      .insert({ id: INSTANCE, domain: 'm150.example.edu', name: 'M150' });
    await admin.from('moodle_courses').insert({
      id: MCOURSE,
      instance_id: INSTANCE,
      moodle_course_id: '150',
      name: 'M Course',
    });
    await admin.from('moodle_sections').insert({
      id: SECTION,
      course_id: MCOURSE,
      moodle_section_id: '1',
      title: 'S1',
      position: 0,
    });
    await admin.from('moodle_files').insert({
      id: MFILE,
      section_id: SECTION,
      type: 'file',
      moodle_url: 'https://m150/file',
      file_name: 'm.pdf',
      content_hash: 'h150',
      // downloaded to the shared moodle-materials bucket (storage_path set) —
      // the materials list only shows imported files that have storage.
      storage_path: `${MCOURSE}/m.pdf`,
      position: 0,
    });
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.from('user_course_syncs').insert({
      id: SYNC,
      user_id: TEST_USER_A.id,
      moodle_course_id: MCOURSE,
      course_id: COURSE,
    });
    await admin.from('user_file_imports').insert({
      user_id: TEST_USER_A.id,
      moodle_file_id: MFILE,
      sync_id: SYNC,
      status: 'imported',
    });
  });
  afterAll(cleanup);

  it('member sees the owner-imported Moodle file', async () => {
    const { getMoodleMaterialsForCourse } = await import('../moodle-materials');
    const sections = await getMoodleMaterialsForCourse(COURSE);
    const fileNames = sections.flatMap((s) =>
      (s.files ?? []).map((f) => f.file_name),
    );
    expect(fileNames).toContain('m.pdf');
  });
});
