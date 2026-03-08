import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the provider module
vi.mock('./provider', () => ({
  getModel: vi.fn(),
}));

// Mock the ai module
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { convertToLatex } from './latex';
import { generateText } from 'ai';

describe('convertToLatex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return LaTeX from the AI model', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '\\frac{1}{2} \\times 5',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await convertToLatex('one half times five');

    expect(result).toBe('\\frac{1}{2} \\times 5');
  });

  it('should trim whitespace from the response', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '  \\frac{1}{2}  \n',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await convertToLatex('one half');

    expect(result).toBe('\\frac{1}{2}');
  });

  it('should call generateText with the correct parameters', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '\\frac{1}{2}',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    await convertToLatex('one half');

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'one half',
        temperature: 0,
      }),
    );
  });

  it('should propagate errors from generateText', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('API error'));

    await expect(convertToLatex('test')).rejects.toThrow('API error');
  });
});
