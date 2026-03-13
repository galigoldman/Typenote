import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../utils';

describe('sanitizeFilename', () => {
  it('should remove unsafe characters', () => {
    expect(sanitizeFilename('my/doc:file*name')).toBe('mydocfilename');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('should return "Untitled" for empty result', () => {
    expect(sanitizeFilename('///:::')).toBe('Untitled');
  });

  it('should return "Untitled" for empty string', () => {
    expect(sanitizeFilename('')).toBe('Untitled');
  });

  it('should preserve normal characters', () => {
    expect(sanitizeFilename('My Document 2024')).toBe('My Document 2024');
  });
});
