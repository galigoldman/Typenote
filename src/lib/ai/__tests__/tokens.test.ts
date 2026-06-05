import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../tokens';

describe('estimateTokens', () => {
  it('approximates ~1 token per 4 characters, rounding up', () => {
    expect(estimateTokens('12345678')).toBe(2); // 8 / 4
    expect(estimateTokens('123456789')).toBe(3); // ceil(9 / 4)
  });

  it('returns 0 for empty or whitespace-only text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBe(0);
  });

  it('handles undefined/null defensively', () => {
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });
});
