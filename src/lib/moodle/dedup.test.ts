import { describe, it, expect, vi } from 'vitest';
import { checkFileExists } from './dedup';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a mock Supabase client that returns different results
 * for sequential .single() calls (first = URL match, second = hash match).
 */
function createMockClient(
  urlResult: { data: unknown },
  hashResult?: { data: unknown },
) {
  let callCount = 0;
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) return Promise.resolve(urlResult);
    return Promise.resolve(hashResult ?? { data: null });
  });
  return chain as unknown as SupabaseClient;
}

describe('checkFileExists', () => {
  it('returns status "exists" when URL matches and hashes are equal', async () => {
    const client = createMockClient({
      data: { id: 'file-1', content_hash: 'abc123' },
    });

    const result = await checkFileExists(
      client,
      'section-1',
      'https://moodle.example.com/file.pdf',
      'abc123',
    );

    expect(result).toEqual({
      exists: true,
      fileId: 'file-1',
      status: 'exists',
    });
  });

  it('returns status "modified" when URL matches but hashes differ', async () => {
    const client = createMockClient({
      data: { id: 'file-1', content_hash: 'abc123' },
    });

    const result = await checkFileExists(
      client,
      'section-1',
      'https://moodle.example.com/file.pdf',
      'def456',
    );

    expect(result).toEqual({
      exists: true,
      fileId: 'file-1',
      status: 'modified',
    });
  });

  it('returns status "exists" when URL matches and contentHash is null', async () => {
    const client = createMockClient({
      data: { id: 'file-1', content_hash: 'abc123' },
    });

    const result = await checkFileExists(
      client,
      'section-1',
      'https://moodle.example.com/file.pdf',
      null,
    );

    expect(result).toEqual({
      exists: true,
      fileId: 'file-1',
      status: 'exists',
    });
  });

  it('returns status "exists" when no URL match but hash matches (cross-course dedup)', async () => {
    const client = createMockClient(
      { data: null },
      { data: { id: 'file-2' } },
    );

    const result = await checkFileExists(
      client,
      'section-1',
      'https://moodle.example.com/new-file.pdf',
      'abc123',
    );

    expect(result).toEqual({
      exists: true,
      fileId: 'file-2',
      status: 'exists',
    });
  });

  it('returns status "new" when no URL match and no hash match', async () => {
    const client = createMockClient({ data: null }, { data: null });

    const result = await checkFileExists(
      client,
      'section-1',
      'https://moodle.example.com/brand-new.pdf',
      'xyz789',
    );

    expect(result).toEqual({
      exists: false,
      status: 'new',
    });
  });

  it('returns status "new" when no URL match and contentHash is null', async () => {
    const client = createMockClient({ data: null });

    const result = await checkFileExists(
      client,
      'section-1',
      'https://moodle.example.com/brand-new.pdf',
      null,
    );

    expect(result).toEqual({
      exists: false,
      status: 'new',
    });
  });
});
