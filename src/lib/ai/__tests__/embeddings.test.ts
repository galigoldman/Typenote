import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEmbedContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { embedContent: mockEmbedContent };
  },
}));

import { chunkFlatText, chunkPages, embedQuery, embedText } from '../embeddings';

afterEach(() => {
  vi.clearAllMocks();
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

describe('chunkPages', () => {
  it('merges tiny consecutive pages into one chunk with a 0-indexed page range', () => {
    const chunks = chunkPages([
      { page: 1, text: 'Slide one title' },
      { page: 2, text: 'Slide two title' },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(0);
    expect(chunks[0].pageEnd).toBe(1);
    expect(chunks[0].text).toContain('Slide one');
    expect(chunks[0].text).toContain('Slide two');
  });

  it('splits a page larger than the budget into chunks tagged the same page', () => {
    const big = 'word '.repeat(700); // ~3500 chars > budget
    const chunks = chunkPages([{ page: 5, text: big }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.pageStart).toBe(4); // 0-indexed
      expect(c.pageEnd).toBe(4);
    }
  });

  it('never splits inside a $$...$$ span (all chunks have balanced $)', () => {
    const math = '$$' + 'x+'.repeat(1200) + 'x$$'; // single span > budget
    const chunks = chunkPages([{ page: 1, text: `intro\n\n${math}\n\noutro` }]);
    for (const c of chunks) {
      // The input has exactly one $$...$$ span, so an even count of unescaped
      // `$` per chunk means the span was never bisected.
      const dollars = (c.text.match(/(?<!\\)\$/g) ?? []).length;
      expect(dollars % 2).toBe(0);
    }
  });

  it('skips empty / image-only pages', () => {
    const chunks = chunkPages([
      { page: 1, text: '   ' },
      { page: 2, text: 'real text' },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
  });
});

describe('chunkFlatText', () => {
  it('produces null page tags for page-less (DOCX) input', () => {
    const chunks = chunkFlatText('some docx text');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBeNull();
    expect(chunks[0].pageEnd).toBeNull();
  });
});
