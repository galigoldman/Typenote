/**
 * Integration test for context-files server actions.
 *
 * Tests the `listContextFiles` pure loader and the underlying DB behaviour
 * (unique-violation on duplicate insert) using the admin/service-role client
 * against the local Supabase instance (RLS bypassed).
 *
 * Covers:
 *   - Inserting a document_context_files row
 *   - Duplicate insert returns Postgres error code 23505 (unique violation)
 *   - listContextFiles returns the correct rows
 *   - Deleting rows reduces the count to 0
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';
import { listContextFiles } from './context-files';

// Fixed IDs so cleanup is idempotent across partial-failure reruns.
const COURSE_ID = 'cf000000-0000-0000-0000-000000000001';
const DOC_ID = 'cf000000-0000-0000-0000-000000000002';
const MATERIAL_ID = 'cf000000-0000-0000-0000-000000000003';

const admin = createAdminClient();

async function cleanupAll(): Promise<void> {
  // Delete leaves before roots to keep cleanup tidy.
  await admin.from('document_context_files').delete().eq('document_id', DOC_ID);
  await admin.from('course_materials').delete().eq('id', MATERIAL_ID);
  await admin.from('documents').delete().eq('id', DOC_ID);
  await admin.from('courses').delete().eq('id', COURSE_ID);
}

beforeAll(async () => {
  await cleanupAll();

  // Create the course.
  const { error: courseErr } = await admin.from('courses').insert({
    id: COURSE_ID,
    user_id: TEST_USER_ID,
    name: 'Context Files Test Course',
    color: '#3B82F6',
    position: 0,
  });
  if (courseErr) throw new Error(`course insert failed: ${courseErr.message}`);

  // Create the document in that course.
  const { error: docErr } = await admin.from('documents').insert({
    id: DOC_ID,
    user_id: TEST_USER_ID,
    course_id: COURSE_ID,
    title: 'Context Files Test Doc',
    subject: 'other',
    canvas_type: 'blank',
    content: {},
    position: 0,
  });
  if (docErr) throw new Error(`document insert failed: ${docErr.message}`);

  // Create a course_material in that course.
  const { error: matErr } = await admin.from('course_materials').insert({
    id: MATERIAL_ID,
    course_id: COURSE_ID,
    user_id: TEST_USER_ID,
    category: 'material',
    storage_path: `${TEST_USER_ID}/context-files-test.pdf`,
    file_name: 'context-files-test.pdf',
    file_size: 1024,
    mime_type: 'application/pdf',
  });
  if (matErr)
    throw new Error(`course_material insert failed: ${matErr.message}`);
});

afterAll(cleanupAll);

describe('document_context_files — DB-level operations', () => {
  it('inserts a context file row successfully', async () => {
    const { error } = await admin.from('document_context_files').insert({
      document_id: DOC_ID,
      file_type: 'course_material',
      file_id: MATERIAL_ID,
    });
    expect(error).toBeNull();
  });

  it('duplicate insert returns Postgres unique-violation code 23505', async () => {
    // Row already inserted by the previous test.
    const { error } = await admin.from('document_context_files').insert({
      document_id: DOC_ID,
      file_type: 'course_material',
      file_id: MATERIAL_ID,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('listContextFiles returns exactly 1 row with correct file_id', async () => {
    const rows = await listContextFiles(admin, DOC_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].file_id).toBe(MATERIAL_ID);
    expect(rows[0].file_type).toBe('course_material');
    expect(rows[0].document_id).toBe(DOC_ID);
  });

  it('deleting the context file row makes listContextFiles return 0 rows', async () => {
    const { error } = await admin
      .from('document_context_files')
      .delete()
      .eq('document_id', DOC_ID)
      .eq('file_type', 'course_material')
      .eq('file_id', MATERIAL_ID);
    expect(error).toBeNull();

    const rows = await listContextFiles(admin, DOC_ID);
    expect(rows).toHaveLength(0);
  });
});
