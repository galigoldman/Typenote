import { describe, it, expect } from 'vitest';
import { safeStorageExtension, buildStorageFileName } from './storage-path';

describe('safeStorageExtension', () => {
  it('returns a clean lowercase extension for a real filename', () => {
    expect(safeStorageExtension('lecture.PDF')).toBe('pdf');
    expect(safeStorageExtension('notes.docx')).toBe('docx');
    expect(safeStorageExtension('slides.pptx')).toBe('pptx');
  });

  it('returns "" when there is no dot', () => {
    expect(safeStorageExtension('lecture notes')).toBe('');
  });

  it('rejects a date/title tail that is not a real extension (the InvalidKey bug)', () => {
    // The exact shape that broke Supabase Storage with InvalidKey.
    expect(safeStorageExtension('2025.12.24 - שיעור תשיעי (CML ו-SML)')).toBe(
      '',
    );
  });

  it('rejects tails with spaces, parens, or unicode', () => {
    expect(safeStorageExtension('report.final version')).toBe('');
    expect(safeStorageExtension('a.(copy)')).toBe('');
    expect(safeStorageExtension('סיכום.שיעור')).toBe('');
  });

  it('rejects an overly long tail (not a plausible extension)', () => {
    expect(safeStorageExtension('archive.superlongword')).toBe('');
  });

  it('handles a trailing dot', () => {
    expect(safeStorageExtension('weird.')).toBe('');
  });
});

describe('buildStorageFileName', () => {
  const HASH = 'a'.repeat(64);

  it('appends a clean extension', () => {
    expect(buildStorageFileName(HASH, 'lecture.pdf')).toBe(`${HASH}.pdf`);
  });

  it('falls back to the bare hash for a title-as-name (no valid ext)', () => {
    const key = buildStorageFileName(
      HASH,
      '2025.12.24 - שיעור תשיעי (CML ו-SML)',
    );
    expect(key).toBe(HASH);
    // The key must be a valid storage key: no spaces, parens, or unicode.
    expect(/^[a-zA-Z0-9.]+$/.test(key)).toBe(true);
  });

  it('uses the bare hash when there is no extension at all', () => {
    expect(buildStorageFileName(HASH, 'lecture notes')).toBe(HASH);
  });
});
