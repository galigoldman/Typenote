import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/embeddings', () => ({
  embedFileSegments: vi.fn(async () => [{ embedding: Array.from({ length: 1536 }, () => 0.1), pageStart: 1, pageEnd: 1 }]),
  embedText: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
  embedQuery: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
}));

vi.mock('@/lib/ai/extraction/docx', () => ({
  extractDocxText: vi.fn(async () => 'DOCX extracted text'),
}));

vi.mock('@/lib/queries/embeddings', () => ({
  upsertEmbeddings: vi.fn(async () => {}),
  deleteEmbeddingsBySource: vi.fn(async () => {}),
  getContentHash: vi.fn(async () => null),
  matchEmbeddings: vi.fn(async () => []),
  getWeekFileRefs: vi.fn(async () => []),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              storage_path: 'test/path.pdf',
              file_name: 'lecture.pdf',
              mime_type: 'application/pdf',
            },
            error: null,
          })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob(['fake file content']),
          error: null,
        })),
      })),
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              storage_path: 'test/path.pdf',
              file_name: 'lecture.pdf',
              mime_type: 'application/pdf',
            },
            error: null,
          })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob(['fake pdf content']),
          error: null,
        })),
      })),
    },
  })),
}));

const mockGenerateContent = vi.fn(async () => ({
  text: 'This is the AI answer based on the lecture materials.',
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('@/lib/ai/prompts', () => ({
  SYSTEM_PROMPT: 'You are a test tutor.',
}));

import { embedFileSegments } from '@/lib/ai/embeddings';
import { getContentHash, upsertEmbeddings } from '@/lib/queries/embeddings';

import { askQuestion, indexContent, searchContext } from '../ai-context';

afterEach(() => {
  vi.clearAllMocks();
});

describe('indexContent', () => {
  it('embeds a PDF file directly via multimodal (no text extraction)', async () => {
    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
      weekId: 'week-1',
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.segmentsIndexed).toBe(1);
    expect(embedFileSegments).toHaveBeenCalledWith(
      expect.any(Buffer),
      'application/pdf',
    );
    expect(upsertEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'course_material',
          mime_type: 'application/pdf',
          segment_text: null, // no text stored for PDFs
        }),
      ]),
    );
  });

  it('skips indexing when content hash matches', async () => {
    vi.mocked(getContentHash).mockResolvedValueOnce(
      'will-not-match',
    );

    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
      weekId: 'week-1',
    });

    expect(result.success).toBe(true);
    expect(getContentHash).toHaveBeenCalledWith('course_material', 'mat-1');
  });

  it('embeds moodle_file as shared (user_id=null)', async () => {
    const result = await indexContent({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'course-1',
    });

    expect(result.success).toBe(true);
    expect(upsertEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ user_id: null }),
      ]),
    );
  });
});

describe('searchContext', () => {
  it('returns results with page ranges', async () => {
    const { matchEmbeddings } = await import('@/lib/queries/embeddings');
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      {
        id: 1,
        source_type: 'course_material',
        source_id: 'mat-1',
        source_name: 'Lecture 5.pdf',
        page_start: 1,
        page_end: 6,
        course_id: 'course-1',
        week_id: 'week-5',
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
    expect(results[0].pageStart).toBe(1);
    expect(results[0].pageEnd).toBe(6);
    expect(results[0].similarity).toBe(0.92);
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

  it('uses multi-turn contents when files are provided', async () => {
    const { matchEmbeddings } = await import('@/lib/queries/embeddings');
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      {
        id: 1,
        source_type: 'moodle_file',
        source_id: 'file-1',
        source_name: 'Lecture.pdf',
        page_start: 1,
        page_end: 6,
        course_id: 'course-1',
        week_id: 'week-1',
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
    // Should have multiple turns: user (files) → model (ack) → user (question)
    expect(call.contents.length).toBeGreaterThanOrEqual(2);
    expect(call.contents[0].role).toBe('user');
    expect(call.contents[call.contents.length - 1].role).toBe('user');
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
