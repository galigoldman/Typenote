import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEmbedContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { embedContent: mockEmbedContent };
  },
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(async () => ({
      getPageCount: () => 3, // less than 6, so no splitting
    })),
    create: vi.fn(),
  },
}));

import { embedFileSegments, embedQuery, embedText } from '../embeddings';

afterEach(() => {
  vi.clearAllMocks();
});

describe('embedFileSegments', () => {
  it('sends PDF with RETRIEVAL_DOCUMENT taskType and correct config', async () => {
    const mockValues = Array.from({ length: 1536 }, () => 0.1);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: mockValues }],
    });

    const buffer = Buffer.from('fake-pdf-content');
    const results = await embedFileSegments(buffer, 'application/pdf');

    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-2-preview',
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: buffer.toString('base64'),
          },
        },
      ],
      config: {
        outputDimensionality: 1536,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    });
    expect(results).toHaveLength(1);
    expect(results[0].embedding).toHaveLength(1536);
    expect(results[0].pageStart).toBe(1);
    expect(results[0].pageEnd).toBe(3);
  });

  it('embeds non-PDF as single segment with RETRIEVAL_DOCUMENT', async () => {
    const mockValues = Array.from({ length: 1536 }, () => 0.1);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: mockValues }],
    });

    const buffer = Buffer.from('fake-pptx-content');
    const results = await embedFileSegments(buffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      }),
    );
    expect(results).toHaveLength(1);
  });

  it('applies RETRIEVAL_DOCUMENT to every chunk of a multi-page PDF', async () => {
    // Mock pdf-lib to return 12 pages (produces 2 chunks of 6)
    const pdfLib = await import('pdf-lib');
    vi.mocked(pdfLib.PDFDocument.load).mockResolvedValueOnce({
      getPageCount: () => 12,
      copyPages: vi.fn(async (_src: unknown, indices: number[]) =>
        indices.map(() => ({})),
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // PDFDocument.create() for each chunk — needs copyPages (called on newDoc)
    const mockNewDoc = {
      copyPages: vi.fn(async (_src: unknown, indices: number[]) =>
        indices.map(() => ({})),
      ),
      addPage: vi.fn(),
      save: vi.fn(async () => new Uint8Array([1, 2, 3])),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(pdfLib.PDFDocument.create).mockResolvedValue(mockNewDoc as any);

    const mockValues = Array.from({ length: 1536 }, () => 0.1);
    mockEmbedContent
      .mockResolvedValueOnce({ embeddings: [{ values: mockValues }] })
      .mockResolvedValueOnce({ embeddings: [{ values: mockValues }] });

    const results = await embedFileSegments(Buffer.from('big-pdf'), 'application/pdf');

    expect(results).toHaveLength(2);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
    // Both chunks must have RETRIEVAL_DOCUMENT
    for (const call of mockEmbedContent.mock.calls) {
      expect(call[0].config.taskType).toBe('RETRIEVAL_DOCUMENT');
    }
    expect(results[0].pageStart).toBe(1);
    expect(results[0].pageEnd).toBe(6);
    expect(results[1].pageStart).toBe(7);
    expect(results[1].pageEnd).toBe(12);
  });

  it('returns empty array when embedding returns no values', async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });
    const results = await embedFileSegments(Buffer.from('x'), 'application/pdf');
    expect(results).toEqual([]);
  });
});

describe('embedText', () => {
  it('sends text with RETRIEVAL_DOCUMENT task type', async () => {
    const mockValues = Array.from({ length: 1536 }, () => 0.2);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: mockValues }],
    });

    const result = await embedText('Some document text');

    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-2-preview',
      contents: 'Some document text',
      config: {
        outputDimensionality: 1536,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    });
    expect(result).toHaveLength(1536);
  });
});

describe('embedQuery', () => {
  it('sends text with RETRIEVAL_QUERY task type', async () => {
    const mockValues = Array.from({ length: 1536 }, () => 0.3);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: mockValues }],
    });

    const result = await embedQuery('search for eigenvalues');

    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-2-preview',
      contents: 'search for eigenvalues',
      config: {
        outputDimensionality: 1536,
        taskType: 'RETRIEVAL_QUERY',
      },
    });
    expect(result).toHaveLength(1536);
  });

  it('returns empty array when no embeddings returned', async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });
    const result = await embedQuery('test');
    expect(result).toEqual([]);
  });
});
