import { describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

import mammoth from 'mammoth';

import { extractDocxText } from '../docx';

describe('extractDocxText', () => {
  it('extracts raw text from a DOCX buffer', async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'Document text content here.',
      messages: [],
    } as never);

    const result = await extractDocxText(Buffer.from('fake-docx'));

    expect(mammoth.extractRawText).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
    });
    expect(result).toBe('Document text content here.');
  });
});
