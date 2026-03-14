import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEmbedContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { embedContent: mockEmbedContent };
  },
}));

import { embedFileSegment, embedQuery, embedText } from '../embeddings';

afterEach(() => {
  vi.clearAllMocks();
});

describe('embedFileSegment', () => {
  it('sends file as base64 inlineData with correct mimeType and 1536 dims', async () => {
    const mockValues = Array.from({ length: 1536 }, () => 0.1);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: mockValues }],
    });

    const buffer = Buffer.from('fake-pdf-content');
    const result = await embedFileSegment(buffer, 'application/pdf');

    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-2-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: buffer.toString('base64'),
              },
            },
          ],
        },
      ],
      config: { outputDimensionality: 1536 },
    });
    expect(result).toHaveLength(1536);
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
