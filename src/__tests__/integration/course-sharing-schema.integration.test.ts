import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000001';

async function cleanup() {
  await admin.from('course_share_links').delete().eq('course_id', COURSE);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('course sharing schema', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('course_members enforces unique(course_id, user_id) and role check', async () => {
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });

    const ok = await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    expect(ok.error).toBeNull();

    const dup = await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
    expect(dup.error).not.toBeNull(); // unique violation

    const badRole = await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_A.id,
      role: 'admin',
    });
    expect(badRole.error).not.toBeNull(); // check violation
  });

  it('course_share_links allows one active link per role', async () => {
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });

    const a = await admin.from('course_share_links').insert({
      course_id: COURSE,
      token: 'tok-viewer-1',
      role: 'viewer',
    });
    expect(a.error).toBeNull();

    const b = await admin.from('course_share_links').insert({
      course_id: COURSE,
      token: 'tok-viewer-2',
      role: 'viewer',
    });
    expect(b.error).not.toBeNull(); // partial unique: one active viewer link
  });
});
