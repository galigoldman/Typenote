import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/embeddings', () => ({
  chunkPages: vi.fn((pages: { page: number; text: string }[]) =>
    pages.map((p, i) => ({
      text: p.text,
      chunkIndex: i,
      pageStart: p.page - 1,
      pageEnd: p.page - 1,
    })),
  ),
  chunkFlatText: vi.fn((text: string) => [
    { text, chunkIndex: 0, pageStart: null, pageEnd: null },
  ]),
  embedText: vi.fn(async () => ({
    values: Array.from({ length: 1536 }, () => 0.1),
    tokens: 1,
  })),
  embedQuery: vi.fn(async () => ({
    values: Array.from({ length: 1536 }, () => 0.1),
    tokens: 1,
  })),
}));

vi.mock('@/lib/ai/extraction/docx', () => ({
  extractDocxText: vi.fn(async () => 'DOCX extracted text'),
}));

vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfPages: vi.fn(async () => [
    { page: 1, text: 'PDF page one with $x^2$ math' },
    { page: 2, text: 'PDF page two' },
  ]),
}));

vi.mock('@/lib/queries/embeddings', () => ({
  upsertEmbeddings: vi.fn(async () => {}),
  deleteEmbeddingsBySource: vi.fn(async () => {}),
  getContentHash: vi.fn(async () => null),
  matchEmbeddings: vi.fn(async () => []),
  getWeekFileRefs: vi.fn(async () => []),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const courseMaterialRow = {
      storage_path: 'test/path.pdf',
      file_name: 'lecture.pdf',
      mime_type: 'application/pdf',
    };

    const from = vi.fn((table: string) => {
      if (table === 'course_materials') {
        const rows = [{ id: 'mat-1', storage_path: 'materials/mat-1.pdf' }];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: courseMaterialRow,
            error: null,
          })),
          single: vi.fn(async () => ({
            data: courseMaterialRow,
            error: null,
          })),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (resolve: (value: any) => any) =>
            resolve({ data: rows, error: null }),
        };
        return chain;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: null, error: null })),
      };
      return chain;
    });

    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'test-user-id' } },
          error: null,
        })),
      },
      from,
      // course_moodle_view RPC — replaces the old user_course_syncs +
      // user_file_imports queries in searchContext. Returns the owner's
      // moodle course id and imported file ids.
      rpc: vi.fn(async (_name: string, _args: unknown) => ({
        data: [
          {
            moodle_course_id: 'moodle-course-1',
            imported_file_ids: ['imported-file-a', 'imported-file-b'],
          },
        ],
        error: null,
      })),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({
            data: new Blob(['fake file content']),
            error: null,
          })),
          createSignedUrl: vi.fn(async () => ({
            data: { signedUrl: 'https://example.com/signed/test.pdf' },
            error: null,
          })),
        })),
      },
    };
  }),
}));

vi.mock('@/lib/supabase/admin', () => {
  const moodleFileRow = {
    storage_path: 'test/path.pdf',
    file_name: 'lecture.pdf',
    mime_type: 'application/pdf',
    section_id: 'section-1',
  };
  const moodleSectionRow = { course_id: 'moodle-course-1' };

  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'moodle_files') {
          const rows = [{ id: 'file-1', storage_path: 'moodle/file-1.pdf' }];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            single: vi.fn(async () => ({
              data: moodleFileRow,
              error: null,
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (resolve: (value: any) => any) =>
              resolve({ data: rows, error: null }),
          };
          return chain;
        }
        if (table === 'content_embeddings') {
          const rows = [
            {
              source_type: 'moodle_file',
              source_id: 'file-1',
              course_id: 'mc-1',
            },
          ];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = {
            select: vi.fn(() => chain),
            update: vi.fn(() => chain),
            // .update(...).not(...) resolves (clearing hashes)
            not: vi.fn(async () => ({ data: null, error: null })),
            // await admin.from('content_embeddings').select(...) resolves here
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (resolve: (value: any) => any) =>
              resolve({ data: rows, error: null }),
          };
          return chain;
        }
        if (table === 'course_materials') {
          const rows = [{ id: 'mat-2', course_id: 'course-2' }];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = {
            select: vi.fn(() => chain),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (resolve: (value: any) => any) =>
              resolve({ data: rows, error: null }),
          };
          return chain;
        }
        const data = table === 'moodle_sections' ? moodleSectionRow : null;
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data, error: null })),
            })),
          })),
        };
      }),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({
            data: new Blob(['fake pdf content']),
            error: null,
          })),
          createSignedUrl: vi.fn(async () => ({
            data: { signedUrl: 'https://example.com/signed/test.pdf' },
            error: null,
          })),
        })),
      },
    })),
  };
});

const mockGenerateContent = vi.fn(async () => ({
  text: 'This is the AI answer based on the lecture materials.',
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('@/lib/ai/prompts', () => ({
  buildSystemPrompt: vi.fn(() => 'You are a test tutor.'),
}));

vi.mock('@/lib/ai/usage-events', () => ({
  recordAiEvent: vi.fn(async () => {}),
}));

vi.mock('@/lib/actions/context-files', () => ({
  listContextFiles: vi.fn(async () => []),
}));

vi.mock('@/lib/ai/context-files', () => ({
  resolveContextFileName: vi.fn(async () => null),
  resolveContextFileMeta: vi.fn(async () => null),
  fileSourceConfig: vi.fn(),
}));

import { embedText } from '@/lib/ai/embeddings';
import { recordAiEvent } from '@/lib/ai/usage-events';
import { extractPdfPages } from '@/lib/ai/extraction/pdf';
import { listContextFiles } from '@/lib/actions/context-files';
import { resolveContextFileName } from '@/lib/ai/context-files';
import {
  getContentHash,
  matchEmbeddings,
  upsertEmbeddings,
} from '@/lib/queries/embeddings';

import {
  buildAiContext,
  indexContent,
  reindexAllContent,
  searchContext,
} from '../ai-context';

afterEach(() => {
  vi.clearAllMocks();
});

describe('indexContent', () => {
  it('extracts per-page text and stores 0-indexed page numbers', async () => {
    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });

    expect(result.success).toBe(true);
    expect(result.segmentsIndexed).toBe(2);
    expect(extractPdfPages).toHaveBeenCalled();
    expect(upsertEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'course_material',
          segment_text: 'PDF page one with $x^2$ math',
          page_start: 0,
          page_end: 0,
        }),
        expect.objectContaining({
          segment_text: 'PDF page two',
          page_start: 1,
          page_end: 1,
        }),
      ]),
    );
  });

  it('fails (not skips) when every chunk embedding fails', async () => {
    // Both pages' embeddings come back empty (malformed API response). The file
    // has chunks, so this is an embedding failure, not a blank file — it must
    // surface as success:false, never a silent skip that hides the outage.
    vi.mocked(embedText)
      .mockResolvedValueOnce({ values: [], tokens: 0 })
      .mockResolvedValueOnce({ values: [], tokens: 0 });

    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.segmentsIndexed).toBe(0);
    expect(upsertEmbeddings).not.toHaveBeenCalled();
  });

  it('skips indexing when content hash matches', async () => {
    vi.mocked(getContentHash).mockResolvedValueOnce('will-not-match');

    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });

    expect(result.success).toBe(true);
    expect(getContentHash).toHaveBeenCalledWith('course_material', 'mat-1');
  });

  it('attributes embedding token cost to the authed user (course_material)', async () => {
    await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });

    // 2 PDF pages -> 2 chunks -> embedText mock returns tokens:1 each = 2.
    expect(recordAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user-id',
        queryType: 'embedding',
        model: 'embedding',
        inputTokens: 2,
        outputTokens: 0,
      }),
    );
  });

  it('attributes moodle embedding cost to triggeredByUserId (row user stays null)', async () => {
    await indexContent({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'callers-typenote-course',
      triggeredByUserId: 'triggering-user',
    });

    expect(recordAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'triggering-user',
        queryType: 'embedding',
        model: 'embedding',
        inputTokens: 2,
        outputTokens: 0,
      }),
    );
  });

  it('does not record embedding cost for moodle when no triggering user', async () => {
    await indexContent({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'callers-typenote-course',
    });

    expect(recordAiEvent).not.toHaveBeenCalled();
  });

  it('embeds moodle_file with canonical moodle_courses.id (not caller course_id)', async () => {
    const result = await indexContent({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'callers-typenote-course', // should be IGNORED for the embedding row
    });

    expect(result.success).toBe(true);
    expect(upsertEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: null,
          course_id: 'moodle-course-1', // looked up via section_id
        }),
      ]),
    );
  });
});

describe('searchContext', () => {
  it('returns results with segment text', async () => {
    const { matchEmbeddings } = await import('@/lib/queries/embeddings');
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      {
        id: 1,
        source_type: 'course_material',
        source_id: 'mat-1',
        source_name: 'Lecture 5.pdf',
        segment_text: 'Extracted text from lecture 5',
        page_start: null,
        page_end: null,
        course_id: 'course-1',
        mime_type: 'application/pdf',
        similarity: 0.92,
      },
    ]);

    const results = await searchContext({
      query: 'eigenvalues',
      courseId: 'course-1',
    });

    expect(results).toHaveLength(1);
    expect(results[0].sourceName).toBe('Lecture 5.pdf');
    expect(results[0].segmentText).toBe('Extracted text from lecture 5');
    expect(results[0].similarity).toBe(0.92);
  });

  it('passes resolved moodleCourseId and importedMoodleFileIds to matchEmbeddings', async () => {
    const { matchEmbeddings } = await import('@/lib/queries/embeddings');
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([]);

    await searchContext({
      query: 'what is in lecture 5?',
      courseId: 'callers-typenote-course',
    });

    expect(matchEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: 'callers-typenote-course',
        moodleCourseId: 'moodle-course-1',
        importedMoodleFileIds: ['imported-file-a', 'imported-file-b'],
      }),
    );
  });
});

describe('buildAiContext attaches signedUrl to sources', () => {
  it('returns a signed URL for each moodle_file source', async () => {
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      {
        id: 1,
        source_type: 'moodle_file',
        source_id: 'file-1',
        source_name: 'lecture5.pdf',
        segment_text: 'foo',
        page_start: null,
        page_end: null,
        course_id: 'moodle-course-1',
        mime_type: 'application/pdf',
        similarity: 0.9,
      },
    ]);

    const { sources } = await buildAiContext({
      question: 'q',
      courseId: 'callers-typenote-course',
      mode: 'quick',
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].signedUrl).toMatch(/^https?:\/\//);
  });
});

describe('buildAiContext multi-chunk retrieval + page citations', () => {
  it('keeps several chunks per file and emits one citation per (source,page)', async () => {
    // source_id MUST be 'mat-1' to match the supabase mock's fixed
    // course_materials row, so the signed-URL lookup resolves.
    const mk = (id: number, page: number) => ({
      id,
      source_type: 'course_material',
      source_id: 'mat-1',
      source_name: 'Lecture9.pdf',
      segment_text: `chunk ${id}`,
      page_start: page,
      page_end: page,
      course_id: 'course-1',
      mime_type: 'application/pdf',
      similarity: 0.9,
    });
    // No attached files -> only the course-wide pass runs (one matchEmbeddings call).
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      mk(1, 0),
      mk(2, 0), // same page as chunk 1 -> citation deduped
      mk(3, 6),
    ]);

    const { sources } = await buildAiContext({
      question: 'q',
      courseId: 'course-1',
      mode: 'quick',
    });

    // Two distinct citations: p.1 and p.7 (0-indexed 0 and 6).
    expect(sources).toHaveLength(2);
    const ranges = sources.map((s) => s.pageRange).sort();
    expect(ranges).toEqual(['p. 1', 'p. 7']);
    // Same file -> both citations share the one signed URL (fetched once).
    expect(sources.every((s) => s.signedUrl?.startsWith('http'))).toBe(true);
  });

  it('caps admitted chunks per source at MAX_CHUNKS_PER_SOURCE (3)', async () => {
    const mk = (id: number, page: number) => ({
      id,
      source_type: 'course_material',
      source_id: 'mat-1',
      source_name: 'Lecture9.pdf',
      segment_text: `chunk ${id}`,
      page_start: page,
      page_end: page,
      course_id: 'course-1',
      mime_type: 'application/pdf',
      similarity: 0.9,
    });
    // Four chunks on four distinct pages from ONE file. The per-source cap (3)
    // admits the first three (pages 0,2,4) and drops the fourth (page 6).
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      mk(1, 0),
      mk(2, 2),
      mk(3, 4),
      mk(4, 6),
    ]);

    const { sources } = await buildAiContext({
      question: 'q',
      courseId: 'course-1',
      mode: 'quick',
    });

    expect(sources).toHaveLength(3);
    expect(sources.map((s) => s.pageRange).sort()).toEqual([
      'p. 1',
      'p. 3',
      'p. 5',
    ]);
  });
});

describe('reindexAllContent', () => {
  it('enumerates indexed sources + unindexed course materials and indexes each', async () => {
    const res = await reindexAllContent();
    // 1 indexed moodle_file (file-1) + 1 unindexed course_material (mat-2) = 2 jobs,
    // both of which index successfully against the mocks — assert the success
    // path, not just that jobs were attempted.
    expect(res.processed).toBe(2);
    expect(res.failed).toBe(0);
  });
});

describe('buildAiContext attached-file focus pass', () => {
  it('sets contextFilesUsed=true and surfaces the attached file in sources', async () => {
    // Arrange: one attached context file
    vi.mocked(listContextFiles).mockResolvedValueOnce([
      {
        id: 'r1',
        document_id: 'doc1',
        file_type: 'course_material',
        file_id: 'fileA',
        created_at: '',
      },
    ]);
    vi.mocked(resolveContextFileName).mockResolvedValueOnce('HW3.pdf');

    // Focus pass (searchContext with sourceIds=['fileA']) returns a matching chunk
    const focusChunk = {
      id: 10,
      source_type: 'course_material',
      source_id: 'fileA',
      source_name: 'HW3.pdf',
      segment_text: 'Relevant content from HW3',
      page_start: null,
      page_end: null,
      course_id: 'course1',
      mime_type: 'application/pdf',
      similarity: 0.95,
    };
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([focusChunk]);

    // Course-wide pass returns empty (keeps focus chunk as the only source)
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([]);

    // Act
    const result = await buildAiContext({
      question: 'q',
      courseId: 'course1',
      documentId: 'doc1',
      mode: 'quick',
    });

    // Assert
    expect(result.contextFilesUsed).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.some((s) => s.sourceId === 'fileA')).toBe(true);
  });
});
