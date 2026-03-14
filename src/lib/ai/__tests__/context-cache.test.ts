import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    caches = {
      create: vi.fn(async () => ({
        name: 'cachedContents/test-cache-123',
      })),
    };
  },
}));

const mockSingle = vi.fn();
const mockDelete = vi.fn();
const mockUpsert = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle,
          })),
          single: mockSingle,
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockEq,
        })),
      })),
      upsert: mockUpsert,
    })),
  })),
}));

import { getOrCreateCache, invalidateCache } from '../context-cache';

afterEach(() => {
  vi.clearAllMocks();
});

describe('getOrCreateCache', () => {
  it('returns existing cache when valid and hash matches', async () => {
    const crypto = await import('crypto');
    const hash = crypto
      .createHash('sha256')
      .update('test materials', 'utf8')
      .digest('hex');

    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'cache-1',
        cache_name: 'cachedContents/existing-cache',
        materials_hash: hash,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      error: null,
    });

    const result = await getOrCreateCache(
      'course-1',
      'week-1',
      'test materials',
    );

    expect(result.cacheName).toBe('cachedContents/existing-cache');
    expect(result.isNew).toBe(false);
  });

  it('creates new cache when no existing cache found', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116' },
    });
    mockUpsert.mockResolvedValueOnce({ error: null });

    const result = await getOrCreateCache(
      'course-1',
      'week-1',
      'new materials',
    );

    expect(result.cacheName).toBe('cachedContents/test-cache-123');
    expect(result.isNew).toBe(true);
  });
});

describe('invalidateCache', () => {
  it('calls delete on the registry', async () => {
    await invalidateCache('course-1', 'week-1');
    expect(mockEq).toHaveBeenCalled();
  });
});
