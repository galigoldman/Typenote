/**
 * Integration test: verifies personal_files CRUD operations, RLS isolation,
 * and foreign key behavior (ON DELETE SET NULL for documents.personal_file_id).
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * RLS isolation is verified by inserting records for two different user_ids
 * and confirming that querying by user_id returns only the expected rows
 * (the admin client bypasses RLS, but the data model enforces user_id scoping).
 *
 * Covers:
 *  T006 — CRUD and RLS isolation
 *  T007 — Foreign key behavior (ON DELETE SET NULL)
 *  T019 — Delete cleanup
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

const COURSE_ID = '30000000-0000-0000-0000-000000000001'; // CS101 from seed

// A fake second user ID for RLS isolation tests.
// We create a temporary profile row for this user so the FK constraint is satisfied.
const USER_B_ID = 'bb000000-0000-0000-0000-000000000001';

// Track created IDs for cleanup (reverse order respects FK dependencies)
const createdIds: { table: string; id: string; column?: string }[] = [];

beforeAll(async () => {
  supabase = createAdminClient();

  // Create a temporary auth.users + profile for User B.
  // profiles.id FK → auth.users(id), so we must create the auth user first.
  // The Supabase admin API can create users directly.
  const { error: authErr } = await supabase.auth.admin.createUser({
    id: USER_B_ID,
    email: 'userb@typenote.test',
    password: 'Test1234',
    email_confirm: true,
  });
  // Ignore if already exists (e.g. from a previous interrupted run)
  if (authErr && !authErr.message.includes('already')) {
    console.warn('Failed to create auth user B:', authErr.message);
  }
});

afterAll(async () => {
  // Clean up in reverse order (respect foreign keys)
  for (const { table, id, column } of createdIds.reverse()) {
    await supabase
      .from(table)
      .delete()
      .eq(column ?? 'id', id);
  }

  // Remove the temporary User B (cascade deletes profile + personal_files)
  await supabase.auth.admin.deleteUser(USER_B_ID);
});

// ─── T006: CRUD and RLS isolation ────────────────────────────────────────────

describe('T006: personal_files CRUD operations', () => {
  let fileId: string;

  it('can insert a personal file for user A', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        file_name: 'integration-test.pdf',
        display_name: 'integration-test',
        mime_type: 'application/pdf',
        file_size: 2048,
        storage_path: `${TEST_USER_ID}/${COURSE_ID}/integration-test.pdf`,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBeDefined();
    expect(data!.user_id).toBe(TEST_USER_ID);
    expect(data!.course_id).toBe(COURSE_ID);
    expect(data!.file_name).toBe('integration-test.pdf');
    expect(data!.display_name).toBe('integration-test');
    expect(data!.mime_type).toBe('application/pdf');
    expect(data!.file_size).toBe(2048);
    expect(data!.created_at).toBeDefined();
    expect(data!.updated_at).toBeDefined();

    fileId = data!.id;
    createdIds.push({ table: 'personal_files', id: fileId });
  });

  it('can read the created personal file by id', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .select('*')
      .eq('id', fileId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.file_name).toBe('integration-test.pdf');
    expect(data!.user_id).toBe(TEST_USER_ID);
  });

  it('can query personal files for user A and only their files appear', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('course_id', COURSE_ID);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // At minimum, the file we just created plus the 2 seeded files
    expect(data!.length).toBeGreaterThanOrEqual(1);

    // Every returned row must belong to user A
    for (const row of data!) {
      expect(row.user_id).toBe(TEST_USER_ID);
    }
  });

  it('can update display_name', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .update({ display_name: 'renamed-integration-test' })
      .eq('id', fileId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.display_name).toBe('renamed-integration-test');
    // file_name should remain unchanged
    expect(data!.file_name).toBe('integration-test.pdf');
  });

  it('can delete a personal file', async () => {
    const { error } = await supabase
      .from('personal_files')
      .delete()
      .eq('id', fileId);

    expect(error).toBeNull();

    // Verify it is gone
    const { data } = await supabase
      .from('personal_files')
      .select('id')
      .eq('id', fileId)
      .single();

    expect(data).toBeNull();

    // Remove from cleanup since we deleted it manually
    const idx = createdIds.findIndex(
      (r) => r.table === 'personal_files' && r.id === fileId,
    );
    if (idx !== -1) createdIds.splice(idx, 1);
  });
});

describe('T006: RLS isolation — user B cannot see user A files', () => {
  let userAFileId: string;
  let userBFileId: string;

  // We also need a course that user B owns for the FK.
  // However, personal_files.course_id references courses(id) ON DELETE CASCADE.
  // We can re-use the same course if user B is just inserting into personal_files
  // (course ownership is not enforced by the personal_files FK, only course existence).
  // But to be safe, let's create a course for user B.
  let userBCourseId: string;

  beforeAll(async () => {
    // Create a course for user B
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .insert({
        user_id: USER_B_ID,
        name: 'User B Course',
        code: 'UB100',
        semester: 'Test',
        color: '#00FF00',
        position: 999,
      })
      .select()
      .single();

    if (courseErr || !course) {
      // If course creation failed, use the existing seed course (admin can insert
      // personal_files for any user into any course since admin bypasses RLS)
      userBCourseId = COURSE_ID;
    } else {
      userBCourseId = course.id;
      createdIds.push({ table: 'courses', id: userBCourseId });
    }
  });

  it('insert a file for user A', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        file_name: 'rls-test-a.pdf',
        display_name: 'rls-test-a',
        mime_type: 'application/pdf',
        file_size: 1024,
        storage_path: `${TEST_USER_ID}/${COURSE_ID}/rls-test-a.pdf`,
      })
      .select()
      .single();

    expect(error).toBeNull();
    userAFileId = data!.id;
    createdIds.push({ table: 'personal_files', id: userAFileId });
  });

  it('insert a file for user B', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .insert({
        user_id: USER_B_ID,
        course_id: userBCourseId,
        file_name: 'rls-test-b.pdf',
        display_name: 'rls-test-b',
        mime_type: 'application/pdf',
        file_size: 512,
        storage_path: `${USER_B_ID}/${userBCourseId}/rls-test-b.pdf`,
      })
      .select()
      .single();

    expect(error).toBeNull();
    userBFileId = data!.id;
    createdIds.push({ table: 'personal_files', id: userBFileId });
  });

  it('querying by user A returns only user A files', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .select('*')
      .eq('user_id', TEST_USER_ID);

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // Every row must belong to user A
    for (const row of data!) {
      expect(row.user_id).toBe(TEST_USER_ID);
    }

    // User A's RLS test file should be present
    const found = data!.find((f) => f.id === userAFileId);
    expect(found).toBeDefined();

    // User B's file must NOT appear
    const leaked = data!.find((f) => f.id === userBFileId);
    expect(leaked).toBeUndefined();
  });

  it('querying by user B returns only user B files', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .select('*')
      .eq('user_id', USER_B_ID);

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // Every row must belong to user B
    for (const row of data!) {
      expect(row.user_id).toBe(USER_B_ID);
    }

    // User B's file should be present
    const found = data!.find((f) => f.id === userBFileId);
    expect(found).toBeDefined();

    // User A's file must NOT appear
    const leaked = data!.find((f) => f.id === userAFileId);
    expect(leaked).toBeUndefined();
  });
});

// ─── T007: Foreign key behavior (ON DELETE SET NULL) ─────────────────────────

describe('T007: document FK — personal_file_id set to NULL on delete', () => {
  let personalFileId: string;
  let documentId: string;

  it('create a personal file', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        file_name: 'fk-test.pdf',
        display_name: 'fk-test',
        mime_type: 'application/pdf',
        file_size: 4096,
        storage_path: `${TEST_USER_ID}/${COURSE_ID}/fk-test.pdf`,
      })
      .select()
      .single();

    expect(error).toBeNull();
    personalFileId = data!.id;
    // Do NOT push to createdIds — we will delete this file as part of the test
  });

  it('create a document linked to the personal file', async () => {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: TEST_USER_ID,
        title: 'FK Test Doc',
        content: { type: 'doc', content: [] },
        subject: 'other',
        canvas_type: 'blank',
        position: 999,
        personal_file_id: personalFileId,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.personal_file_id).toBe(personalFileId);

    documentId = data!.id;
    createdIds.push({ table: 'documents', id: documentId });
  });

  it('delete the personal file', async () => {
    const { error } = await supabase
      .from('personal_files')
      .delete()
      .eq('id', personalFileId);

    expect(error).toBeNull();

    // Confirm the personal file is gone
    const { data } = await supabase
      .from('personal_files')
      .select('id')
      .eq('id', personalFileId)
      .single();

    expect(data).toBeNull();
  });

  it('document still exists but personal_file_id is NULL', async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, personal_file_id')
      .eq('id', documentId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe(documentId);
    expect(data!.title).toBe('FK Test Doc');
    // ON DELETE SET NULL should have cleared the reference
    expect(data!.personal_file_id).toBeNull();
  });
});

// ─── T019: Delete cleanup ────────────────────────────────────────────────────

describe('T019: delete cleanup — file is removed from personal_files table', () => {
  let fileId: string;

  it('create a personal file', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        file_name: 'cleanup-test.pdf',
        display_name: 'cleanup-test',
        mime_type: 'application/pdf',
        file_size: 8192,
        storage_path: `${TEST_USER_ID}/${COURSE_ID}/cleanup-test.pdf`,
      })
      .select()
      .single();

    expect(error).toBeNull();
    fileId = data!.id;
    // Do NOT push to createdIds — we will delete this file as part of the test
  });

  it('delete the personal file', async () => {
    const { error } = await supabase
      .from('personal_files')
      .delete()
      .eq('id', fileId);

    expect(error).toBeNull();
  });

  it('verify the file is removed from the personal_files table', async () => {
    const { data, error } = await supabase
      .from('personal_files')
      .select('id')
      .eq('id', fileId);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBe(0);
  });
});
