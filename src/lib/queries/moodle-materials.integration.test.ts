import { describe, expect, it, beforeAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMoodleImportableFiles } from './moodle-materials';

// These tests require local Supabase running with seeded data.
// See CLAUDE.md and supabase/seed.sql for credentials and fixtures.

describe('getMoodleImportableFiles (integration)', () => {
  let testUserId: string;
  let testCourseId: string;

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data: user } = await admin.auth.admin.getUserByEmail(
      'test@typenote.dev',
    );
    if (!user?.user) throw new Error('seed user missing');
    testUserId = user.user.id;

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('user_id', testUserId)
      .limit(1)
      .single();
    if (!course) throw new Error('seed course missing');
    testCourseId = course.id;
  });

  it('returns only files the current user has imported', async () => {
    const files = await getMoodleImportableFiles(testCourseId, testUserId);
    // All returned files must be of type "file" with a storage_path
    for (const file of files) {
      expect(file.storage_path).toBeTruthy();
      expect(file.file_name).toBeTruthy();
    }
  });

  it('returns empty array when course has no Moodle sync', async () => {
    const files = await getMoodleImportableFiles(
      '00000000-0000-0000-0000-000000000000',
      testUserId,
    );
    expect(files).toEqual([]);
  });
});
