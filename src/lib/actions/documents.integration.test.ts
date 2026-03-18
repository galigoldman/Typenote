/**
 * Integration test: verifies moveDocument-style DB operations work
 * against the real database.
 *
 * Since moveDocument is a Next.js server action that depends on
 * createClient() (cookie-based auth), we test the underlying DB
 * operations directly using the service-role admin client.
 *
 * Covers:
 *   - Moving between folder, course, week, and root
 *   - Cross-course move (course A -> course B)
 *   - CHECK constraint enforcement (folder_id XOR course_id)
 *   - Content preservation after move
 */
import { describe, it, expect, afterEach, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

// Seed data IDs
const FOLDER_ID = '10000000-0000-0000-0000-000000000001'; // Calculus I
const COURSE_ID = '30000000-0000-0000-0000-000000000001'; // CS101
const COURSE_B_ID = '30000000-0000-0000-0000-000000000002'; // Linear Algebra
const WEEK_1_ID = '40000000-0000-0000-0000-000000000001'; // Week 1
const WEEK_2_ID = '40000000-0000-0000-0000-000000000002'; // Week 2

let supabase: SupabaseClient;

/** IDs of documents created during tests, cleaned up in afterEach/afterAll */
const createdDocIds: string[] = [];

/** Helper: insert a test document and track it for cleanup */
async function insertDoc(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: TEST_USER_ID,
      title: 'Move Test Doc',
      subject: 'other',
      canvas_type: 'blank',
      content: {},
      position: 0,
      folder_id: null,
      course_id: null,
      week_id: null,
      ...overrides,
    })
    .select('id')
    .single();

  if (error) throw new Error(`insertDoc failed: ${error.message}`);
  createdDocIds.push(data!.id);
  return data!.id;
}

/** Helper: fetch a document by ID */
async function fetchDoc(id: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`fetchDoc failed: ${error.message}`);
  return data!;
}

beforeAll(() => {
  supabase = createAdminClient();
});

afterEach(async () => {
  // Clean up documents created during each test
  for (const id of createdDocIds) {
    await supabase.from('documents').delete().eq('id', id);
  }
  createdDocIds.length = 0;
});

afterAll(async () => {
  // Safety net: delete any remaining test documents
  for (const id of createdDocIds) {
    await supabase.from('documents').delete().eq('id', id);
  }
});

describe('moveDocument — DB-level operations', () => {
  it('move folder -> course: clears folder_id, sets course_id', async () => {
    const docId = await insertDoc({ folder_id: FOLDER_ID });

    // Simulate moveDocument destination: { type: 'course', courseId }
    const { error } = await supabase
      .from('documents')
      .update({
        folder_id: null,
        course_id: COURSE_ID,
        week_id: null,
      })
      .eq('id', docId);

    expect(error).toBeNull();

    const doc = await fetchDoc(docId);
    expect(doc.folder_id).toBeNull();
    expect(doc.course_id).toBe(COURSE_ID);
    expect(doc.week_id).toBeNull();
  });

  it('move course -> folder: clears course_id/week_id, sets folder_id', async () => {
    const docId = await insertDoc({
      course_id: COURSE_ID,
      week_id: WEEK_1_ID,
    });

    // Simulate moveDocument destination: { type: 'folder', folderId }
    const { error } = await supabase
      .from('documents')
      .update({
        folder_id: FOLDER_ID,
        course_id: null,
        week_id: null,
      })
      .eq('id', docId);

    expect(error).toBeNull();

    const doc = await fetchDoc(docId);
    expect(doc.folder_id).toBe(FOLDER_ID);
    expect(doc.course_id).toBeNull();
    expect(doc.week_id).toBeNull();
  });

  it('move week -> week (same course): updates week_id, course_id unchanged', async () => {
    const docId = await insertDoc({
      course_id: COURSE_ID,
      week_id: WEEK_1_ID,
    });

    const { error } = await supabase
      .from('documents')
      .update({ week_id: WEEK_2_ID })
      .eq('id', docId);

    expect(error).toBeNull();

    const doc = await fetchDoc(docId);
    expect(doc.course_id).toBe(COURSE_ID);
    expect(doc.week_id).toBe(WEEK_2_ID);
  });

  it('cross-course move: updates course_id and clears week_id', async () => {
    // Create a document in course A, week 1
    const docId = await insertDoc({
      course_id: COURSE_ID,
      week_id: WEEK_1_ID,
    });

    // Verify initial state
    const before = await fetchDoc(docId);
    expect(before.course_id).toBe(COURSE_ID);
    expect(before.week_id).toBe(WEEK_1_ID);

    // Move to course B (different course), clearing week and folder
    const { error } = await supabase
      .from('documents')
      .update({
        course_id: COURSE_B_ID,
        week_id: null,
        folder_id: null,
      })
      .eq('id', docId);

    expect(error).toBeNull();

    const doc = await fetchDoc(docId);
    expect(doc.course_id).toBe(COURSE_B_ID);
    expect(doc.week_id).toBeNull();
    expect(doc.folder_id).toBeNull();
  });

  it('move to root: clears folder_id, course_id, week_id', async () => {
    const docId = await insertDoc({
      course_id: COURSE_ID,
      week_id: WEEK_1_ID,
    });

    // Simulate moveDocument destination: { type: 'root' }
    const { error } = await supabase
      .from('documents')
      .update({
        folder_id: null,
        course_id: null,
        week_id: null,
      })
      .eq('id', docId);

    expect(error).toBeNull();

    const doc = await fetchDoc(docId);
    expect(doc.folder_id).toBeNull();
    expect(doc.course_id).toBeNull();
    expect(doc.week_id).toBeNull();
  });

  it('DB constraint rejects folder_id AND course_id set simultaneously', async () => {
    const docId = await insertDoc({ folder_id: FOLDER_ID });

    // Attempt to set both folder_id and course_id — should violate
    // the CHECK constraint: documents_folder_or_course
    const { error } = await supabase
      .from('documents')
      .update({
        folder_id: FOLDER_ID,
        course_id: COURSE_ID,
      })
      .eq('id', docId);

    expect(error).not.toBeNull();
    // The constraint name or a "check" violation message should appear
    expect(error!.message).toMatch(/folder_or_course|check|violat/i);
  });

  it('content and title preserved after move', async () => {
    const richContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Important notes about limits.' }],
        },
      ],
    };

    const docId = await insertDoc({
      title: 'Preserved Content Doc',
      content: richContent,
      folder_id: FOLDER_ID,
    });

    // Move from folder to course with week
    const { error } = await supabase
      .from('documents')
      .update({
        folder_id: null,
        course_id: COURSE_ID,
        week_id: WEEK_1_ID,
      })
      .eq('id', docId);

    expect(error).toBeNull();

    const doc = await fetchDoc(docId);
    expect(doc.title).toBe('Preserved Content Doc');
    expect(doc.content).toEqual(richContent);
    // Confirm the location actually changed
    expect(doc.folder_id).toBeNull();
    expect(doc.course_id).toBe(COURSE_ID);
    expect(doc.week_id).toBe(WEEK_1_ID);
  });
});
