import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/embeddings', () => ({
  chunkText: vi.fn((text: string) => [{ text, chunkIndex: 0 }]),
  embedText: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
  embedQuery: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
}));

vi.mock('@/lib/ai/extraction/docx', () => ({
  extractDocxText: vi.fn(async () => 'DOCX extracted text'),
}));

vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfText: vi.fn(async () => 'PDF extracted text with $x^2$ math'),
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
    const syncRow = { id: 'sync-1', moodle_course_id: 'moodle-course-1' };
    const importsRows = [
      { moodle_file_id: 'imported-file-a' },
      { moodle_file_id: 'imported-file-b' },
    ];

    const from = vi.fn((table: string) => {
      if (table === 'user_file_imports') {
        // Awaitable directly (no .single/.maybeSingle in our usage)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (resolve: (value: any) => any) =>
            resolve({ data: importsRows, error: null }),
        };
        return chain;
      }
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
      const data = table === 'user_course_syncs' ? syncRow : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data, error: null })),
        single: vi.fn(async () => ({ data, error: null })),
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

vi.mock('@/lib/actions/context-files', () => ({
  listContextFiles: vi.fn(async () => []),
}));

vi.mock('@/lib/ai/context-files', () => ({
  resolveContextFileName: vi.fn(async () => null),
  resolveContextFileMeta: vi.fn(async () => null),
  fileSourceConfig: vi.fn(),
}));

import { extractPdfText } from '@/lib/ai/extraction/pdf';
import { listContextFiles } from '@/lib/actions/context-files';
import { resolveContextFileName } from '@/lib/ai/context-files';
import {
  getContentHash,
  matchEmbeddings,
  upsertEmbeddings,
} from '@/lib/queries/embeddings';

import {
  askQuestion,
  buildAiContext,
  indexContent,
  searchContext,
} from '../ai-context';

afterEach(() => {
  vi.clearAllMocks();
});

describe('indexContent', () => {
  it('extracts text from PDF and embeds as text', async () => {
    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.segmentsIndexed).toBe(1);
    expect(extractPdfText).toHaveBeenCalledWith(expect.any(Buffer));
    expect(upsertEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'course_material',
          segment_text: 'PDF extracted text with $x^2$ math',
        }),
      ]),
    );
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

describe('askQuestion', () => {
  it('generates an answer using flash model in quick mode', async () => {
    const result = await askQuestion({
      question: 'What is an integral?',
      courseId: 'course-1',
      mode: 'quick',
    });

    expect(result.answer).toContain('AI answer');
    expect(result.model).toBe('flash');
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        config: expect.objectContaining({
          systemInstruction: expect.any(String),
        }),
      }),
    );
  });

  it('sends matched text as context instead of downloading files', async () => {
    const { matchEmbeddings } = await import('@/lib/queries/embeddings');
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      {
        id: 1,
        source_type: 'moodle_file',
        source_id: 'file-1',
        source_name: 'Lecture.pdf',
        segment_text: 'This is the lecture content about integrals.',
        page_start: null,
        page_end: null,
        course_id: 'course-1',
        mime_type: 'application/pdf',
        similarity: 0.85,
      },
    ]);

    await askQuestion({
      question: 'What is an integral?',
      courseId: 'course-1',
      mode: 'quick',
    });

    const call = mockGenerateContent.mock.calls[0][0];
    // Should have text context, not file inlineData
    const firstUserPart = call.contents[0].parts[0];
    expect(firstUserPart.text).toContain('Lecture.pdf');
    expect(firstUserPart.text).toContain('integrals');
    // Should NOT have inlineData
    expect(firstUserPart.inlineData).toBeUndefined();
  });

  it('uses pro model in deep mode', async () => {
    await askQuestion({
      question: 'Explain eigenvalues',
      courseId: 'course-1',
      mode: 'deep',
    });

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-pro',
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
