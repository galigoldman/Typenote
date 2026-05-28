/**
 * Integration test: verifies that indexContent (moodle_file path) stores
 * 0-indexed per-page numbers into the real content_embeddings table.
 *
 * Uses the moodle_file path specifically because it uses createAdminClient()
 * (service-role, no cookies) throughout — no Next.js request context required.
 * The course_material / personal_file paths call cookie-based createClient()
 * via getAuthUserId() and cannot run in a plain Vitest node environment.
 *
 * Gemini extraction and embeddings require API keys that are unavailable in CI,
 * so we mock them:
 *   - extractPdfPages → 2 fixed page objects (page 1 and page 2)
 *   - embedText / embedQuery → deterministic 1536-dim vectors
 *   - chunkPages / chunkFlatText → real implementation (via vi.importActual)
 *     so the real page-tagging logic runs end-to-end into Postgres.
 */

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any imports
// ---------------------------------------------------------------------------

// Each page text is padded to ~1.3k chars: large enough that chunkPages does
// NOT merge the two tiny pages into one chunk (merge happens when the combined
// length fits the ~1600-char budget), but small enough that neither page is
// split further. Result: exactly one chunk per page, tagged with its own page.
vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfPages: vi.fn(async () => [
    { page: 1, text: 'PAGE ONE. ' + 'lorem ipsum '.repeat(110) },
    { page: 2, text: 'PAGE TWO. ' + 'dolor sit amet '.repeat(85) },
  ]),
}));

vi.mock('@/lib/ai/embeddings', async (orig) => {
  const actual = await orig<typeof import('@/lib/ai/embeddings')>();
  return {
    ...actual, // real chunkPages / chunkFlatText
    embedText: vi.fn(async () => Array.from({ length: 1536 }, () => 0.05)),
    embedQuery: vi.fn(async () => Array.from({ length: 1536 }, () => 0.05)),
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/test/supabase-client';
import { indexContent } from '@/lib/actions/ai-context';

// ---------------------------------------------------------------------------
// Fixed UUIDs for this test — chosen to be collision-free with seeded data
// ---------------------------------------------------------------------------

const INSTANCE_ID = 'aa000000-0000-0000-0000-000000000001';
const MOODLE_COURSE_ID = 'aa000000-0000-0000-0000-000000000002';
const SECTION_ID = 'aa000000-0000-0000-0000-000000000003';
const MOODLE_FILE_ID = 'aa000000-0000-0000-0000-000000000004';

// Storage path within the moodle-materials bucket
const STORAGE_PATH = `${MOODLE_COURSE_ID}/page-indexing-test.pdf`;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seed() {
  const admin = createAdminClient();

  // 1. moodle_instances (required parent for moodle_courses)
  const { error: instErr } = await admin.from('moodle_instances').insert({
    id: INSTANCE_ID,
    domain: 'page-indexing-test.ac.il',
    name: 'Page Indexing Test Instance',
  });
  if (instErr) throw new Error(`seed moodle_instances: ${instErr.message}`);

  // 2. moodle_courses (referenced by indexContent via section→course lookup)
  const { error: courseErr } = await admin.from('moodle_courses').insert({
    id: MOODLE_COURSE_ID,
    instance_id: INSTANCE_ID,
    moodle_course_id: 'page-idx-101',
    name: 'Page Indexing Test Course',
    moodle_url: 'https://page-indexing-test.ac.il/course/view.php?id=101',
  });
  if (courseErr) throw new Error(`seed moodle_courses: ${courseErr.message}`);

  // 3. moodle_sections (indexContent reads section.course_id to set course_id
  //    on the embedding row)
  const { error: secErr } = await admin.from('moodle_sections').insert({
    id: SECTION_ID,
    course_id: MOODLE_COURSE_ID,
    moodle_section_id: 'page-idx-sec-1',
    title: 'Page Indexing Test Section',
    position: 0,
  });
  if (secErr) throw new Error(`seed moodle_sections: ${secErr.message}`);

  // 4. moodle_files — indexContent reads: storage_path, file_name, mime_type,
  //    section_id. mime_type must be application/pdf to trigger the PDF path.
  const { error: fileErr } = await admin.from('moodle_files').insert({
    id: MOODLE_FILE_ID,
    section_id: SECTION_ID,
    type: 'file',
    moodle_url:
      'https://page-indexing-test.ac.il/pluginfile.php/101/page-indexing-test.pdf',
    file_name: 'page-indexing-test.pdf',
    storage_path: STORAGE_PATH,
    mime_type: 'application/pdf',
    position: 0,
  });
  if (fileErr) throw new Error(`seed moodle_files: ${fileErr.message}`);

  // 5. Upload a dummy file to the moodle-materials bucket at the storage path.
  //    The file content is irrelevant — extractPdfPages is mocked — but the
  //    download call in indexContent must succeed.
  const { error: uploadErr } = await admin.storage
    .from('moodle-materials')
    .upload(
      STORAGE_PATH,
      Buffer.from('%PDF-1.4 fake pdf for page-indexing test'),
      {
        contentType: 'application/pdf',
        upsert: true,
      },
    );
  if (uploadErr) throw new Error(`seed storage upload: ${uploadErr.message}`);
}

async function cleanup() {
  const admin = createAdminClient();
  // Reverse-order deletion to respect foreign key constraints.
  await admin
    .from('content_embeddings')
    .delete()
    .eq('source_type', 'moodle_file')
    .eq('source_id', MOODLE_FILE_ID);
  await admin.from('moodle_files').delete().eq('id', MOODLE_FILE_ID);
  await admin.from('moodle_sections').delete().eq('id', SECTION_ID);
  await admin.from('moodle_courses').delete().eq('id', MOODLE_COURSE_ID);
  await admin.from('moodle_instances').delete().eq('id', INSTANCE_ID);
  await admin.storage.from('moodle-materials').remove([STORAGE_PATH]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('indexContent (moodle_file path) — per-page indexing', () => {
  beforeAll(async () => {
    await cleanup(); // idempotent pre-clean in case of a previous aborted run
    await seed();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('stores non-null 0-indexed page numbers on first index', async () => {
    const r1 = await indexContent({
      type: 'moodle_file',
      fileId: MOODLE_FILE_ID,
      courseId: MOODLE_COURSE_ID,
    });

    expect(r1.success).toBe(true);
    expect(r1.skipped).toBe(false);
    // extractPdfPages returns 2 pages; each fits in one chunk → 2 segments
    expect(r1.segmentsIndexed).toBe(2);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('content_embeddings')
      .select('segment_index, page_start, page_end, segment_text')
      .eq('source_type', 'moodle_file')
      .eq('source_id', MOODLE_FILE_ID)
      .order('segment_index');

    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    // Page numbers are stored 0-indexed (page 1 → 0, page 2 → 1)
    expect(data![0].page_start).toBe(0);
    expect(data![0].page_end).toBe(0);
    expect(data![1].page_start).toBe(1);
    expect(data![1].page_end).toBe(1);

    // No row should have a null page_start
    expect(data!.every((row) => row.page_start !== null)).toBe(true);
  });

  it('skips re-indexing when file content is unchanged (hash match)', async () => {
    // The file in storage is identical to the first run — indexContent should
    // detect the matching content_hash and skip without reinserting.
    const r2 = await indexContent({
      type: 'moodle_file',
      fileId: MOODLE_FILE_ID,
      courseId: MOODLE_COURSE_ID,
    });

    expect(r2.success).toBe(true);
    expect(r2.skipped).toBe(true);
    expect(r2.segmentsIndexed).toBe(0);

    // Embeddings written by the first run must still be present
    const admin = createAdminClient();
    const { data } = await admin
      .from('content_embeddings')
      .select('id')
      .eq('source_type', 'moodle_file')
      .eq('source_id', MOODLE_FILE_ID);

    expect(data).toHaveLength(2);
  });
});
