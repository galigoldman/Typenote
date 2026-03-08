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

// Mock uuid to produce predictable IDs
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++;
    return `uuid-${uuidCounter}`;
  }),
}));

import {
  queueEdit,
  getPendingEdits,
  removePendingEdit,
  clearPendingEdits,
} from '@/lib/offline/sync-queue';

describe('sync-queue', () => {
  beforeEach(() => {
    store.clear();
    uuidCounter = 0;
  });

  describe('queueEdit + getPendingEdits', () => {
    it('queues an edit and retrieves it', async () => {
      await queueEdit({
        document_id: 'doc-1',
        field: 'content',
        value: { type: 'doc', content: [] },
        timestamp: '2026-01-01T00:00:00Z',
      });

      const edits = await getPendingEdits();
      expect(edits).toHaveLength(1);
      expect(edits[0].id).toBe('uuid-1');
      expect(edits[0].document_id).toBe('doc-1');
      expect(edits[0].field).toBe('content');
      expect(edits[0].value).toEqual({ type: 'doc', content: [] });
      expect(edits[0].timestamp).toBe('2026-01-01T00:00:00Z');
    });

    it('queues multiple edits', async () => {
      await queueEdit({
        document_id: 'doc-1',
        field: 'content',
        value: { type: 'doc', content: [] },
        timestamp: '2026-01-01T00:00:00Z',
      });

      await queueEdit({
        document_id: 'doc-1',
        field: 'title',
        value: 'New Title',
        timestamp: '2026-01-01T00:01:00Z',
      });

      const edits = await getPendingEdits();
      expect(edits).toHaveLength(2);
    });

    it('returns edits in chronological order (insertion order)', async () => {
      await queueEdit({
        document_id: 'doc-1',
        field: 'title',
        value: 'First',
        timestamp: '2026-01-01T00:00:00Z',
      });

      await queueEdit({
        document_id: 'doc-2',
        field: 'content',
        value: { type: 'doc' },
        timestamp: '2026-01-01T00:01:00Z',
      });

      await queueEdit({
        document_id: 'doc-1',
        field: 'title',
        value: 'Third',
        timestamp: '2026-01-01T00:02:00Z',
      });

      const edits = await getPendingEdits();
      expect(edits).toHaveLength(3);
      expect(edits[0].value).toBe('First');
      expect(edits[1].value).toEqual({ type: 'doc' });
      expect(edits[2].value).toBe('Third');
    });

    it('returns an empty array when no edits are queued', async () => {
      const edits = await getPendingEdits();
      expect(edits).toEqual([]);
    });
  });

  describe('removePendingEdit', () => {
    it('removes a specific edit by id', async () => {
      await queueEdit({
        document_id: 'doc-1',
        field: 'content',
        value: { v: 1 },
        timestamp: '2026-01-01T00:00:00Z',
      });

      await queueEdit({
        document_id: 'doc-1',
        field: 'content',
        value: { v: 2 },
        timestamp: '2026-01-01T00:01:00Z',
      });

      let edits = await getPendingEdits();
      expect(edits).toHaveLength(2);

      // Remove the first edit
      await removePendingEdit('uuid-1');

      edits = await getPendingEdits();
      expect(edits).toHaveLength(1);
      expect(edits[0].id).toBe('uuid-2');
    });

    it('does not affect other edits when removing one', async () => {
      await queueEdit({
        document_id: 'doc-1',
        field: 'title',
        value: 'A',
        timestamp: '2026-01-01T00:00:00Z',
      });

      await queueEdit({
        document_id: 'doc-2',
        field: 'title',
        value: 'B',
        timestamp: '2026-01-01T00:01:00Z',
      });

      await queueEdit({
        document_id: 'doc-3',
        field: 'title',
        value: 'C',
        timestamp: '2026-01-01T00:02:00Z',
      });

      await removePendingEdit('uuid-2');

      const edits = await getPendingEdits();
      expect(edits).toHaveLength(2);
      expect(edits[0].value).toBe('A');
      expect(edits[1].value).toBe('C');
    });
  });

  describe('clearPendingEdits', () => {
    it('removes all pending edits', async () => {
      await queueEdit({
        document_id: 'doc-1',
        field: 'content',
        value: { v: 1 },
        timestamp: '2026-01-01T00:00:00Z',
      });

      await queueEdit({
        document_id: 'doc-2',
        field: 'content',
        value: { v: 2 },
        timestamp: '2026-01-01T00:01:00Z',
      });

      await queueEdit({
        document_id: 'doc-3',
        field: 'title',
        value: 'Title',
        timestamp: '2026-01-01T00:02:00Z',
      });

      let edits = await getPendingEdits();
      expect(edits).toHaveLength(3);

      await clearPendingEdits();

      edits = await getPendingEdits();
      expect(edits).toEqual([]);
    });

    it('does nothing when there are no pending edits', async () => {
      // Should not throw
      await clearPendingEdits();

      const edits = await getPendingEdits();
      expect(edits).toEqual([]);
    });
  });
});
