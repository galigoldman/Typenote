/**
 * Integration tests for `course-weeks.ts` and `course-materials.ts` schema
 * behavior — the parts the server actions rely on but that no other test
 * exercises directly.
 *
 * Risk surfaces:
 *
 *   - UNIQUE(course_id, week_number) — prevents two "Week 1" rows in the same
 *     course. createCourseWeek computes `max + 1` to avoid this, but the
 *     constraint is the actual guarantee — pinning it ensures any future
 *     auto-numbering bug fails loudly instead of silently.
 *
 *   - course_weeks.course_id CASCADE — deleting a course removes its weeks.
 *   - course_materials.week_id CASCADE — deleting a week removes its materials.
 *
 *   - documents.week_id ON DELETE SET NULL — deleting a week must NOT delete
 *     the documents in it; they keep their course_id. Contrast with
 *     documents.course_id CASCADE — week-deletion is a re-organization,
 *     course-deletion is destructive.
 *
 *   - chk_week_requires_course — week_id cannot be set without course_id.
 *
 *   - course_materials.category CHECK ('material' | 'homework').
 *
 *   - RLS USING on UPDATE/DELETE for both tables.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEST_USER_A,
  TEST_USER_B,
  TEST_USER_ID,
  createAdminClient,
  createUserClient,
} from '@/test/supabase-client';

const admin = createAdminClient();

const COURSE_ID = '7b000000-0000-0000-0000-000000000001';
const WEEK_1_ID = '7b000000-0000-0000-0000-000000000002';
const WEEK_2_ID = '7b000000-0000-0000-0000-000000000003';
const MATERIAL_ID = '7b000000-0000-0000-0000-000000000010';
const DOC_IN_WEEK_ID = '7b000000-0000-0000-0000-000000000020';
const USER_B_COURSE_ID = '7b000000-0000-0000-0000-0000000000b0';
const USER_B_WEEK_ID = '7b000000-0000-0000-0000-0000000000b1';
const USER_B_MATERIAL_ID = '7b000000-0000-0000-0000-0000000000b2';

const allTestIds = [
  COURSE_ID,
  WEEK_1_ID,
  WEEK_2_ID,
  MATERIAL_ID,
  DOC_IN_WEEK_ID,
  USER_B_COURSE_ID,
  USER_B_WEEK_ID,
  USER_B_MATERIAL_ID,
];

async function cleanupAll(): Promise<void> {
  await admin.from('course_materials').delete().in('id', allTestIds);
  await admin.from('course_weeks').delete().in('id', allTestIds);
  await admin.from('documents').delete().in('id', allTestIds);
  await admin.from('courses').delete().in('id', allTestIds);
}

async function seedCourse(courseId = COURSE_ID, userId = TEST_USER_ID) {
  await admin.from('courses').insert({
    id: courseId,
    user_id: userId,
    name: 'Test Course',
    color: '#000000',
    position: 0,
  });
}

describe('course_weeks — schema behavior', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);
  afterEach(cleanupAll);

  it('createCourseWeek: round-trips course_id/week_number/topic', async () => {
    await seedCourse();

    const { error } = await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
      topic: 'Introduction',
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('course_weeks')
      .select('*')
      .eq('id', WEEK_1_ID)
      .single();
    expect(data).toMatchObject({
      course_id: COURSE_ID,
      week_number: 1,
      topic: 'Introduction',
    });
  });

  it('UNIQUE(course_id, week_number) rejects a duplicate Week 1', async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });

    const { error } = await admin.from('course_weeks').insert({
      id: WEEK_2_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });

    expect(error).not.toBeNull();
    // Supabase surfaces the constraint name in error.message
    expect(error!.message).toMatch(/duplicate|unique/i);
  });

  it('deleting a course CASCADES to its weeks (FK course_weeks.course_id ON DELETE CASCADE)', async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });

    await admin.from('courses').delete().eq('id', COURSE_ID);

    const { data } = await admin
      .from('course_weeks')
      .select('id')
      .eq('id', WEEK_1_ID);
    expect(data ?? []).toHaveLength(0);
  });

  it('deleting a week sets documents.week_id NULL but keeps course_id (re-organization, not destructive)', async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });
    await admin.from('documents').insert({
      id: DOC_IN_WEEK_ID,
      user_id: TEST_USER_ID,
      course_id: COURSE_ID,
      week_id: WEEK_1_ID,
      title: 'Doc in week',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    await admin.from('course_weeks').delete().eq('id', WEEK_1_ID);

    const { data } = await admin
      .from('documents')
      .select('id, week_id, course_id')
      .eq('id', DOC_IN_WEEK_ID)
      .single();
    // Doc survives — its week_id is null, course_id still set.
    expect(data).not.toBeNull();
    expect(data!.week_id).toBeNull();
    expect(data!.course_id).toBe(COURSE_ID);
  });

  it('chk_week_requires_course rejects a doc with week_id but no course_id', async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });

    const { error } = await admin.from('documents').insert({
      id: DOC_IN_WEEK_ID,
      user_id: TEST_USER_ID,
      course_id: null,
      week_id: WEEK_1_ID,
      title: 'Should fail',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/chk_week_requires_course/i);
  });
});

describe('course_materials — schema behavior', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);
  afterEach(cleanupAll);

  it('createCourseMaterial: round-trips required fields', async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });

    const { error } = await admin.from('course_materials').insert({
      id: MATERIAL_ID,
      week_id: WEEK_1_ID,
      user_id: TEST_USER_ID,
      category: 'material',
      storage_path: `${TEST_USER_ID}/lec01.pdf`,
      file_name: 'lec01.pdf',
      label: 'Lecture 1',
      file_size: 4096,
      mime_type: 'application/pdf',
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('course_materials')
      .select('*')
      .eq('id', MATERIAL_ID)
      .single();
    expect(data).toMatchObject({
      week_id: WEEK_1_ID,
      category: 'material',
      file_name: 'lec01.pdf',
      label: 'Lecture 1',
    });
  });

  it("category CHECK constraint rejects values other than 'material' | 'homework'", async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });

    const { error } = await admin.from('course_materials').insert({
      id: MATERIAL_ID,
      week_id: WEEK_1_ID,
      user_id: TEST_USER_ID,
      category: 'lecture-notes', // not allowed
      storage_path: `${TEST_USER_ID}/bad.pdf`,
      file_name: 'bad.pdf',
      file_size: 1,
      mime_type: 'application/pdf',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/check|category/i);
  });

  it('deleting a week CASCADES to its materials (FK course_materials.week_id ON DELETE CASCADE)', async () => {
    await seedCourse();
    await admin.from('course_weeks').insert({
      id: WEEK_1_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      week_number: 1,
    });
    await admin.from('course_materials').insert({
      id: MATERIAL_ID,
      week_id: WEEK_1_ID,
      user_id: TEST_USER_ID,
      category: 'material',
      storage_path: `${TEST_USER_ID}/x.pdf`,
      file_name: 'x.pdf',
      file_size: 1,
      mime_type: 'application/pdf',
    });

    await admin.from('course_weeks').delete().eq('id', WEEK_1_ID);

    const { data } = await admin
      .from('course_materials')
      .select('id')
      .eq('id', MATERIAL_ID);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('course_weeks + course_materials — RLS write enforcement', () => {
  let clientA: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);

    await admin.from('course_materials').delete().eq('id', USER_B_MATERIAL_ID);
    await admin.from('course_weeks').delete().eq('id', USER_B_WEEK_ID);
    await admin.from('courses').delete().eq('id', USER_B_COURSE_ID);

    await admin.from('courses').insert({
      id: USER_B_COURSE_ID,
      user_id: TEST_USER_B.id,
      name: "B's course",
      color: '#0000FF',
      position: 0,
    });
    await admin.from('course_weeks').insert({
      id: USER_B_WEEK_ID,
      course_id: USER_B_COURSE_ID,
      user_id: TEST_USER_B.id,
      week_number: 1,
      topic: "B's week",
    });
    await admin.from('course_materials').insert({
      id: USER_B_MATERIAL_ID,
      week_id: USER_B_WEEK_ID,
      user_id: TEST_USER_B.id,
      category: 'homework',
      storage_path: `${TEST_USER_B.id}/private.pdf`,
      file_name: 'private.pdf',
      file_size: 1,
      mime_type: 'application/pdf',
    });
  });

  afterAll(async () => {
    await admin.from('course_materials').delete().eq('id', USER_B_MATERIAL_ID);
    await admin.from('course_weeks').delete().eq('id', USER_B_WEEK_ID);
    await admin.from('courses').delete().eq('id', USER_B_COURSE_ID);
  });

  it("User A's UPDATE on User B's course_week affects 0 rows", async () => {
    await clientA
      .from('course_weeks')
      .update({ topic: 'hacked-by-a' })
      .eq('id', USER_B_WEEK_ID);

    const { data } = await admin
      .from('course_weeks')
      .select('topic')
      .eq('id', USER_B_WEEK_ID)
      .single();
    expect(data!.topic).toBe("B's week");
  });

  it("User A's DELETE on User B's course_week affects 0 rows", async () => {
    await clientA.from('course_weeks').delete().eq('id', USER_B_WEEK_ID);

    const { data } = await admin
      .from('course_weeks')
      .select('id')
      .eq('id', USER_B_WEEK_ID);
    expect(data ?? []).toHaveLength(1);
  });

  it("User A's DELETE on User B's course_material affects 0 rows", async () => {
    await clientA
      .from('course_materials')
      .delete()
      .eq('id', USER_B_MATERIAL_ID);

    const { data } = await admin
      .from('course_materials')
      .select('id')
      .eq('id', USER_B_MATERIAL_ID);
    expect(data ?? []).toHaveLength(1);
  });
});
