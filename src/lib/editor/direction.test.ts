import { describe, it, expect } from 'vitest';
import { detectDirection } from './direction';

describe('detectDirection', () => {
  it('returns "rtl" for Hebrew text', () => {
    expect(detectDirection('שלום עולם')).toBe('rtl');
  });

  it('returns "ltr" for English text', () => {
    expect(detectDirection('Hello world')).toBe('ltr');
  });

  it('returns "rtl" when Hebrew character comes first', () => {
    expect(detectDirection('שלום Hello')).toBe('rtl');
  });

  it('returns "ltr" when English character comes first', () => {
    expect(detectDirection('Hello שלום')).toBe('ltr');
  });

  it('returns "ltr" for empty string (default)', () => {
    expect(detectDirection('')).toBe('ltr');
  });

  it('returns "ltr" for numbers only (default)', () => {
    expect(detectDirection('12345')).toBe('ltr');
  });

  it('returns "rtl" for Arabic text', () => {
    expect(detectDirection('مرحبا بالعالم')).toBe('rtl');
  });
});
