import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

const supabase = createAdminClient();

const COURSE_ID = '30000000-0000-0000-0000-000000000001'; // CS101 from seed
const WEEK_ID = '40000000-0000-0000-0000-000000000001'; // Week 1 from seed
const SOURCE_ID_1 = '70000000-0000-0000-0000-000000000001';
const SOURCE_ID_2 = '70000000-0000-0000-0000-000000000002';

// 1536-dim test vectors
function makeVector(seed: number): number[] {
  return Array.from({ length: 1536 }, (_, i) => Math.sin(seed + i * 0.01));
}

describe('content_embeddings table (v2 — 1536 dims, page segments)', () => {
  beforeAll(async () => {
    await supabase
      .from('content_embeddings')
      .delete()
      .in('source_id', [SOURCE_ID_1, SOURCE_ID_2]);
  });

  afterAll(async () => {
    await supabase
      .from('content_embeddings')
      .delete()
      .in('source_id', [SOURCE_ID_1, SOURCE_ID_2]);
  });

  it('inserts PDF page segment embeddings with page_start/page_end', async () => {
    const { error } = await supabase.from('content_embeddings').insert([
      {
        source_type: 'course_material',
        source_id: SOURCE_ID_1,
        segment_index: 0,
        page_start: 1,
        page_end: 6,
        segment_text: null, // multimodal — no text stored
        embedding: JSON.stringify(makeVector(1)),
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        week_id: WEEK_ID,
        source_name: 'Lecture 1 Slides.pdf',
        mime_type: 'application/pdf',
        content_hash: 'pdf-hash-1',
      },
      {
        source_type: 'course_material',
        source_id: SOURCE_ID_1,
        segment_index: 1,
        page_start: 7,
        page_end: 12,
        segment_text: null,
        embedding: JSON.stringify(makeVector(2)),
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        week_id: WEEK_ID,
        source_name: 'Lecture 1 Slides.pdf',
        mime_type: 'application/pdf',
        content_hash: 'pdf-hash-1',
      },
    ]);

    expect(error).toBeNull();
  });

  it('inserts shared moodle file embedding (user_id = NULL)', async () => {
    const { error } = await supabase.from('content_embeddings').insert({
      source_type: 'moodle_file',
      source_id: SOURCE_ID_2,
      segment_index: 0,
      page_start: 1,
      page_end: 6,
      segment_text: null,
      embedding: JSON.stringify(makeVector(3)),
      user_id: null,
      course_id: COURSE_ID,
      week_id: WEEK_ID,
      source_name: 'Shared Lecture.pdf',
      mime_type: 'application/pdf',
      content_hash: 'shared-hash-1',
    });

    expect(error).toBeNull();
  });

  it('enforces unique constraint on (source_type, source_id, segment_index)', async () => {
    const { error } = await supabase.from('content_embeddings').insert({
      source_type: 'course_material',
      source_id: SOURCE_ID_1,
      segment_index: 0, // duplicate
      embedding: JSON.stringify(makeVector(99)),
      user_id: TEST_USER_ID,
      course_id: COURSE_ID,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('match_embeddings returns results with page ranges and similarity', async () => {
    const queryVector = makeVector(1.05); // close to seed=1

    const { data, error } = await supabase.rpc('match_embeddings', {
      query_embedding: JSON.stringify(queryVector),
      match_user_id: TEST_USER_ID,
      match_course_id: COURSE_ID,
      match_count: 5,
      similarity_threshold: 0.0,
    });

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);

    for (const row of data!) {
      expect(row.similarity).toBeGreaterThan(0);
      expect(row.source_type).toBeTruthy();
      expect(row.source_name).toBeTruthy();
    }

    // First result should have page_start/page_end
    const first = data![0];
    expect(first.page_start).toBeDefined();
    expect(first.page_end).toBeDefined();

    // Sorted by similarity descending
    if (data!.length >= 2) {
      expect(data![0].similarity).toBeGreaterThanOrEqual(data![1].similarity);
    }
  });

  it('selects both owned and shared embeddings', async () => {
    const { data, error } = await supabase
      .from('content_embeddings')
      .select('source_type, source_id, user_id, page_start, page_end')
      .eq('course_id', COURSE_ID)
      .order('segment_index');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);

    const owned = data!.filter((r) => r.user_id === TEST_USER_ID);
    const shared = data!.filter((r) => r.user_id === null);
    expect(owned.length).toBeGreaterThanOrEqual(2);
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes embeddings by source', async () => {
    const tempId = '70000000-0000-0000-0000-000000000099';
    await supabase.from('content_embeddings').insert({
      source_type: 'course_material',
      source_id: tempId,
      segment_index: 0,
      page_start: 1,
      page_end: 6,
      embedding: JSON.stringify(makeVector(99)),
      user_id: TEST_USER_ID,
      course_id: COURSE_ID,
    });

    const { error } = await supabase
      .from('content_embeddings')
      .delete()
      .eq('source_type', 'course_material')
      .eq('source_id', tempId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from('content_embeddings')
      .select('id')
      .eq('source_id', tempId);

    expect(data).toHaveLength(0);
  });
});
