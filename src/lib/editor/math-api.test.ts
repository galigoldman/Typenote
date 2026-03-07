import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateMathToLatex } from './math-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('translateMathToLatex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns latex on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ latex: 'x^2 + 1' }),
    });

    const result = await translateMathToLatex('x squared plus one');

    expect(result).toBe('x^2 + 1');
    expect(mockFetch).toHaveBeenCalledWith('/api/math/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x squared plus one' }),
    });
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Missing or empty "text" field' }),
    });

    await expect(translateMathToLatex('')).rejects.toThrow(
      'Missing or empty "text" field',
    );
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(translateMathToLatex('x squared')).rejects.toThrow(
      'Network error',
    );
  });
});
