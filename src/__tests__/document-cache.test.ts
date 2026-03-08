import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store that simulates idb-keyval
const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
  keys: vi.fn(() => Promise.resolve([...store.keys()])),
}));

import {
  cacheDocument,
  getCachedDocument,
  listCachedDocuments,
  removeCachedDocument,
  markDocumentDirty,
} from '@/lib/offline/document-cache';

function makeDoc(
  id: string,
  overrides?: Partial<{
    title: string;
    content: Record<string, unknown>;
    updated_at: string;
  }>,
) {
  return {
    id,
    title: overrides?.title ?? `Document ${id}`,
    content: overrides?.content ?? { type: 'doc', content: [] },
    updated_at: overrides?.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('document-cache', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('cacheDocument + getCachedDocument', () => {
    it('stores a document and retrieves it by id', async () => {
      const doc = makeDoc('doc-1');
      await cacheDocument(doc);

      const cached = await getCachedDocument('doc-1');
      expect(cached).toBeDefined();
      expect(cached!.id).toBe('doc-1');
      expect(cached!.title).toBe('Document doc-1');
      expect(cached!.content).toEqual({ type: 'doc', content: [] });
      expect(cached!.updated_at).toBe('2026-01-01T00:00:00Z');
      expect(cached!.is_dirty).toBe(false);
      expect(cached!.cached_at).toBeTruthy();
    });

    it('returns undefined for a non-existent document', async () => {
      const cached = await getCachedDocument('non-existent');
      expect(cached).toBeUndefined();
    });

    it('overwrites an existing cached document', async () => {
      await cacheDocument(makeDoc('doc-1', { title: 'Original' }));
      await cacheDocument(makeDoc('doc-1', { title: 'Updated' }));

      const cached = await getCachedDocument('doc-1');
      expect(cached!.title).toBe('Updated');
    });
  });

  describe('listCachedDocuments', () => {
    it('returns an empty array when no documents are cached', async () => {
      const docs = await listCachedDocuments();
      expect(docs).toEqual([]);
    });

    it('returns all cached documents', async () => {
      await cacheDocument(makeDoc('a'));
      await cacheDocument(makeDoc('b'));
      await cacheDocument(makeDoc('c'));

      const docs = await listCachedDocuments();
      expect(docs).toHaveLength(3);

      const ids = docs.map((d) => d.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
    });

    it('returns documents in LRU order (oldest first)', async () => {
      await cacheDocument(makeDoc('first'));
      await cacheDocument(makeDoc('second'));
      await cacheDocument(makeDoc('third'));

      const docs = await listCachedDocuments();
      expect(docs[0].id).toBe('first');
      expect(docs[1].id).toBe('second');
      expect(docs[2].id).toBe('third');
    });
  });

  describe('removeCachedDocument', () => {
    it('removes a cached document', async () => {
      await cacheDocument(makeDoc('doc-1'));
      await removeCachedDocument('doc-1');

      const cached = await getCachedDocument('doc-1');
      expect(cached).toBeUndefined();

      const docs = await listCachedDocuments();
      expect(docs).toHaveLength(0);
    });

    it('does not affect other cached documents', async () => {
      await cacheDocument(makeDoc('doc-1'));
      await cacheDocument(makeDoc('doc-2'));
      await removeCachedDocument('doc-1');

      const remaining = await listCachedDocuments();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('doc-2');
    });
  });

  describe('markDocumentDirty', () => {
    it('sets is_dirty to true on a cached document', async () => {
      await cacheDocument(makeDoc('doc-1'));

      let cached = await getCachedDocument('doc-1');
      expect(cached!.is_dirty).toBe(false);

      await markDocumentDirty('doc-1');

      cached = await getCachedDocument('doc-1');
      expect(cached!.is_dirty).toBe(true);
    });

    it('does nothing if the document is not cached', async () => {
      // Should not throw
      await markDocumentDirty('non-existent');
      const cached = await getCachedDocument('non-existent');
      expect(cached).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least recently used document when over 50 documents', async () => {
      // Cache 50 documents
      for (let i = 0; i < 50; i++) {
        await cacheDocument(makeDoc(`doc-${i}`));
      }

      let docs = await listCachedDocuments();
      expect(docs).toHaveLength(50);

      // Cache one more — should evict doc-0 (the LRU entry)
      await cacheDocument(makeDoc('doc-50'));

      docs = await listCachedDocuments();
      expect(docs).toHaveLength(50);

      const ids = docs.map((d) => d.id);
      expect(ids).not.toContain('doc-0');
      expect(ids).toContain('doc-50');
      expect(ids).toContain('doc-1'); // doc-1 is still present

      // Verify the evicted document is actually removed from storage
      const evicted = await getCachedDocument('doc-0');
      expect(evicted).toBeUndefined();
    });

    it('re-caching an existing document promotes it and does not evict', async () => {
      // Cache 50 documents
      for (let i = 0; i < 50; i++) {
        await cacheDocument(makeDoc(`doc-${i}`));
      }

      // Re-cache doc-0 to promote it to the end (most recently used)
      await cacheDocument(makeDoc('doc-0', { title: 'Refreshed' }));

      const docs = await listCachedDocuments();
      expect(docs).toHaveLength(50);

      // doc-0 should now be at the end (most recently used)
      expect(docs[docs.length - 1].id).toBe('doc-0');
      expect(docs[docs.length - 1].title).toBe('Refreshed');

      // Now cache one more — should evict doc-1 (the new LRU entry), not doc-0
      await cacheDocument(makeDoc('doc-50'));

      const updatedDocs = await listCachedDocuments();
      const ids = updatedDocs.map((d) => d.id);
      expect(ids).toContain('doc-0');
      expect(ids).not.toContain('doc-1');
      expect(ids).toContain('doc-50');
    });
  });
});
