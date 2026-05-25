/**
 * Integration tests for the schema behavior `courses.ts` server actions rely on.
 *
 * Key risk surfaces (NOT covered by existing tests):
 *
 *   - `courses.folder_id` references `folders(id) ON DELETE SET NULL`.
 *     Deleting a folder must NOT delete courses inside it; they move to root.
 *
 *   - `documents.course_id` references `courses(id) ON DELETE CASCADE`.
 *     This is the OPPOSITE of `documents.folder_id` (SET NULL). Deleting a
 *     course deletes every document inside it — by design — because a course
 *     deletion is destructive, not a re-organization. This test pins that
 *     contract so it can't silently change.
 *
 *   - Cascade to course_materials: deleting a course must also delete its
 *     course_materials (course_materials.course_id FK ON DELETE CASCADE).
 *     The flat model has no course_weeks — materials link directly to courses.
 *
 *   - `documents_folder_or_course` CHECK constraint prevents a row from being
 *     in both a folder and a course simultaneously.
 *
 *   - RLS USING clause on UPDATE/DELETE — cross-user writes must affect 0
 *     rows. The existing `rls-isolation` test only covers SELECT.
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

const COURSE_ID = '7c000000-0000-0000-0000-000000000001';
const MATERIAL_ID = '7c000000-0000-0000-0000-000000000003';
const DOC_IN_COURSE_ID = '7c000000-0000-0000-0000-000000000010';
const FOLDER_ID = '7c000000-0000-0000-0000-000000000020';
const USER_B_COURSE_ID = '7c000000-0000-0000-0000-0000000000b1';

const allTestIds = [
  COURSE_ID,
  MATERIAL_ID,
  DOC_IN_COURSE_ID,
  FOLDER_ID,
  USER_B_COURSE_ID,
];

async function cleanupAll(): Promise<void> {
  // Leaves before roots: materials -> docs -> courses -> folders.
  // Even though FKs cascade, deleting leaves first keeps cleanup idempotent
  // across partial-failure reruns.
  await admin.from('course_materials').delete().in('id', allTestIds);
  await admin.from('documents').delete().in('id', allTestIds);
  await admin.from('courses').delete().in('id', allTestIds);
  await admin.from('folders').delete().in('id', allTestIds);
}

describe('courses — schema behavior backing courses.ts server actions', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);
  afterEach(cleanupAll);

  it('createCourse: round-trips name/color/folder_id', async () => {
    const { error } = await admin.from('courses').insert({
      id: COURSE_ID,
      user_id: TEST_USER_ID,
      name: 'CS101',
      color: '#3B82F6',
      folder_id: null,
      position: 0,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('courses')
      .select('*')
      .eq('id', COURSE_ID)
      .single();
    expect(data).toMatchObject({
      name: 'CS101',
      color: '#3B82F6',
      folder_id: null,
      user_id: TEST_USER_ID,
    });
  });

  it('updateCourse: updated_at trigger fires when name/color change', async () => {
    await admin.from('courses').insert({
      id: COURSE_ID,
      user_id: TEST_USER_ID,
      name: 'Old',
      color: '#000000',
      position: 0,
    });

    const { data: before } = await admin
      .from('courses')
      .select('updated_at')
      .eq('id', COURSE_ID)
      .single();
    const originalUpdatedAt = before!.updated_at as string;

    await new Promise((r) => setTimeout(r, 50));

    await admin
      .from('courses')
      .update({ name: 'New', color: '#FFFFFF' })
      .eq('id', COURSE_ID);

    const { data: after } = await admin
      .from('courses')
      .select('name, color, updated_at')
      .eq('id', COURSE_ID)
      .single();
    expect(after!.name).toBe('New');
    expect(after!.color).toBe('#FFFFFF');
    expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it('deleting a course CASCADES to its course_materials (course_id FK ON DELETE CASCADE)', async () => {
    // Flat model: course_materials.course_id references courses(id) directly —
    // no intermediate course_weeks table. Verify the cascade still fires.
    await admin.from('courses').insert({
      id: COURSE_ID,
      user_id: TEST_USER_ID,
      name: 'Doomed',
      color: '#000000',
      position: 0,
    });
    await admin.from('course_materials').insert({
      id: MATERIAL_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_ID,
      category: 'material',
      storage_path: `${TEST_USER_ID}/test.pdf`,
      file_name: 'test.pdf',
      file_size: 1024,
      mime_type: 'application/pdf',
    });

    // Verify the material exists before deletion
    const { data: before } = await admin
      .from('course_materials')
      .select('id')
      .eq('id', MATERIAL_ID);
    expect(before ?? []).toHaveLength(1);

    await admin.from('courses').delete().eq('id', COURSE_ID);

    const { data: materials } = await admin
      .from('course_materials')
      .select('id')
      .eq('id', MATERIAL_ID);
    expect(materials ?? []).toHaveLength(0);
  });

  it('deleting a course CASCADES to its documents (course_id ON DELETE CASCADE — destructive by design)', async () => {
    await admin.from('courses').insert({
      id: COURSE_ID,
      user_id: TEST_USER_ID,
      name: 'Doomed Course',
      color: '#000000',
      position: 0,
    });
    await admin.from('documents').insert({
      id: DOC_IN_COURSE_ID,
      user_id: TEST_USER_ID,
      course_id: COURSE_ID,
      title: 'Doc in course',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    await admin.from('courses').delete().eq('id', COURSE_ID);

    const { data } = await admin
      .from('documents')
      .select('id')
      .eq('id', DOC_IN_COURSE_ID);
    // CASCADE: doc is gone. Contrast with deleting a *folder*, which
    // sets folder_id NULL instead.
    expect(data ?? []).toHaveLength(0);
  });

  it('deleting a folder leaves the course intact with folder_id = null (ON DELETE SET NULL)', async () => {
    await admin.from('folders').insert({
      id: FOLDER_ID,
      user_id: TEST_USER_ID,
      name: 'Container',
      color: '#000000',
      position: 0,
    });
    await admin.from('courses').insert({
      id: COURSE_ID,
      user_id: TEST_USER_ID,
      folder_id: FOLDER_ID,
      name: 'CS101',
      color: '#000000',
      position: 0,
    });

    await admin.from('folders').delete().eq('id', FOLDER_ID);

    const { data } = await admin
      .from('courses')
      .select('id, folder_id')
      .eq('id', COURSE_ID)
      .single();
    expect(data).not.toBeNull();
    expect(data!.folder_id).toBeNull();
  });

  it('documents_folder_or_course CHECK constraint rejects a doc claiming both', async () => {
    await admin.from('folders').insert({
      id: FOLDER_ID,
      user_id: TEST_USER_ID,
      name: 'F',
      color: '#000000',
      position: 0,
    });
    await admin.from('courses').insert({
      id: COURSE_ID,
      user_id: TEST_USER_ID,
      name: 'C',
      color: '#000000',
      position: 0,
    });

    const { error } = await admin.from('documents').insert({
      id: DOC_IN_COURSE_ID,
      user_id: TEST_USER_ID,
      folder_id: FOLDER_ID,
      course_id: COURSE_ID,
      title: 'Should fail',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/documents_folder_or_course/i);
  });
});

describe('courses — RLS update/delete enforcement', () => {
  let clientA: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    await admin.from('courses').delete().eq('id', USER_B_COURSE_ID);
    await admin.from('courses').insert({
      id: USER_B_COURSE_ID,
      user_id: TEST_USER_B.id,
      name: "B's private course",
      color: '#0000FF',
      position: 0,
    });
  });

  afterAll(async () => {
    await admin.from('courses').delete().eq('id', USER_B_COURSE_ID);
  });

  it("User A's UPDATE on User B's course affects 0 rows", async () => {
    await clientA
      .from('courses')
      .update({ name: 'hacked-by-a' })
      .eq('id', USER_B_COURSE_ID);

    const { data } = await admin
      .from('courses')
      .select('name')
      .eq('id', USER_B_COURSE_ID)
      .single();
    expect(data!.name).toBe("B's private course");
  });

  it("User A's DELETE on User B's course affects 0 rows", async () => {
    await clientA.from('courses').delete().eq('id', USER_B_COURSE_ID);

    const { data } = await admin
      .from('courses')
      .select('id')
      .eq('id', USER_B_COURSE_ID);
    expect(data ?? []).toHaveLength(1);
  });
});
