import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { generateContent: mockGenerateContent };
  },
  Type: {
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
    INTEGER: 'INTEGER',
    STRING: 'STRING',
  },
}));

import { extractPdfPages, extractPdfText } from '../pdf';

afterEach(() => vi.clearAllMocks());

describe('extractPdfPages', () => {
  it('parses structured pages and sorts them by page number', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { page: 2, text: 'Second' },
        { page: 1, text: 'First with $x^2$' },
      ]),
    });
    const pages = await extractPdfPages(Buffer.from('pdf'));
    expect(pages).toEqual([
      { page: 1, text: 'First with $x^2$' },
      { page: 2, text: 'Second' },
    ]);
  });

  it('keeps Hebrew text intact through the JSON round-trip', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([{ page: 1, text: 'שלום עולם' }]),
    });
    const pages = await extractPdfPages(Buffer.from('pdf'));
    expect(pages[0].text).toBe('שלום עולם');
  });

  it('returns [] on invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'not json' });
    expect(await extractPdfPages(Buffer.from('pdf'))).toEqual([]);
  });

  it('returns [] when the model response has no text', async () => {
    mockGenerateContent.mockResolvedValueOnce({});
    expect(await extractPdfPages(Buffer.from('pdf'))).toEqual([]);
  });

  it('drops entries with invalid page numbers (NaN, 0, negative)', async () => {
    // Downstream we do `page - 1` to store a 0-indexed page; a bad page would
    // become a silent NaN/negative citation. Reject it at the extraction edge.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { page: 0, text: 'zero' },
        { page: -1, text: 'negative' },
        { page: 2, text: 'valid' },
      ]),
    });
    const pages = await extractPdfPages(Buffer.from('pdf'));
    expect(pages).toEqual([{ page: 2, text: 'valid' }]);
  });
});

describe('extractPdfText (wrapper)', () => {
  it('joins page texts with blank lines', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { page: 1, text: 'A' },
        { page: 2, text: 'B' },
      ]),
    });
    expect(await extractPdfText(Buffer.from('pdf'))).toBe('A\n\nB');
  });
});
