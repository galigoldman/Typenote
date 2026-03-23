import { describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}));

import mammoth from 'mammoth';

import { convertDocxToHtml } from '@/lib/docx/convert';

describe('convertDocxToHtml', () => {
  it('should convert a valid docx buffer and return HTML', async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: '<p>Hello world</p>',
      messages: [],
    } as never);

    const result = await convertDocxToHtml(Buffer.from('fake-docx'));

    expect(mammoth.convertToHtml).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
    });
    expect(result.html).toBe('<p>Hello world</p>');
    expect(result.warnings).toEqual([]);
  });

  it('should capture warnings from mammoth', async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: '<p>Content</p>',
      messages: [
        { type: 'warning', message: 'Unrecognised style: CustomStyle' },
        { type: 'warning', message: 'Image not found' },
        { type: 'error', message: 'This should be excluded' },
      ],
    } as never);

    const result = await convertDocxToHtml(Buffer.from('fake-docx'));

    expect(result.html).toBe('<p>Content</p>');
    expect(result.warnings).toEqual([
      'Unrecognised style: CustomStyle',
      'Image not found',
    ]);
  });

  it('should throw on invalid buffer when mammoth fails', async () => {
    vi.mocked(mammoth.convertToHtml).mockRejectedValue(
      new Error('Can not read ZIP file'),
    );

    const invalidBuffer = Buffer.from('this is not a docx file');
    await expect(convertDocxToHtml(invalidBuffer)).rejects.toThrow(
      'Failed to convert document',
    );
  });

  it('should throw on empty buffer', async () => {
    const emptyBuffer = Buffer.alloc(0);
    await expect(convertDocxToHtml(emptyBuffer)).rejects.toThrow(
      'Failed to convert document. The file may be corrupted or in an unsupported format.',
    );
  });
});
