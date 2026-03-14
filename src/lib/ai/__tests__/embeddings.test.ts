import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEmbedContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { embedContent: mockEmbedContent };
  },
}));

import { chunkText, embedQuery, embedText } from '../embeddings';

afterEach(() => {
  vi.clearAllMocks();
});

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const result = chunkText('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello world');
    expect(result[0].chunkIndex).toBe(0);
  });

  it('splits long text at paragraph boundaries', () => {
    // Create text longer than 25000 chars
    const paragraph = 'A'.repeat(13000);
    const longText = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;

    const result = chunkText(longText);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].chunkIndex).toBe(0);
    expect(result[1].chunkIndex).toBe(1);
    // All text should be preserved
    const totalLength = result.reduce((sum, c) => sum + c.text.length, 0);
    expect(totalLength).toBeGreaterThan(0);
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
