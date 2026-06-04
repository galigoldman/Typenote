import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Make the server-action createClient run as owner A (anon key + A's JWT).
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_A } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_A) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000100';

async function cleanup() {
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('course_share_links').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('course-sharing actions (as owner A)', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
  });
  afterAll(cleanup);

  it('createOrUpdateShareLink creates an active viewer link', async () => {
    const { createOrUpdateShareLink } = await import('../course-sharing');
    const { token } = await createOrUpdateShareLink({
      courseId: COURSE,
      role: 'viewer',
    });
    expect(token).toMatch(/.{16,}/);
    const { data } = await admin
      .from('course_share_links')
      .select('role, is_active')
      .eq('course_id', COURSE)
      .eq('token', token)
      .single();
    expect(data).toEqual({ role: 'viewer', is_active: true });
  });

  it('createOrUpdateShareLink is idempotent for an existing active role link', async () => {
    const { createOrUpdateShareLink } = await import('../course-sharing');
    const first = await createOrUpdateShareLink({
      courseId: COURSE,
      role: 'viewer',
    });
    const second = await createOrUpdateShareLink({
      courseId: COURSE,
      role: 'viewer',
    });
    expect(second.token).toBe(first.token); // reused existing active link
  });

  it('regenerateShareLink deactivates the old token and returns a new one', async () => {
    const { createOrUpdateShareLink, regenerateShareLink } =
      await import('../course-sharing');
    const first = await createOrUpdateShareLink({
      courseId: COURSE,
      role: 'contributor',
    });
    const second = await regenerateShareLink({
      courseId: COURSE,
      role: 'contributor',
    });
    expect(second.token).not.toBe(first.token);
    const { data: old } = await admin
      .from('course_share_links')
      .select('is_active')
      .eq('token', first.token)
      .single();
    expect(old!.is_active).toBe(false);
  });

  it('listMembers returns the roster with roles and profile info', async () => {
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    const { listMembers } = await import('../course-sharing');
    const members = await listMembers(COURSE);
    const b = members.find((m) => m.user_id === TEST_USER_B.id);
    expect(b).toBeTruthy();
    expect(b!.role).toBe('viewer');
    expect(b!.email).toBe(TEST_USER_B.email); // resolved via admin client
  });

  it('updateMemberRole promotes a member to contributor', async () => {
    const { updateMemberRole } = await import('../course-sharing');
    await updateMemberRole({
      courseId: COURSE,
      userId: TEST_USER_B.id,
      role: 'contributor',
    });
    const { data } = await admin
      .from('course_members')
      .select('role')
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id)
      .single();
    expect(data!.role).toBe('contributor');
  });
});
