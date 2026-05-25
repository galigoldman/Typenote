import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfText: vi.fn(async () => 'PDF_TEXT'),
}));
vi.mock('@/lib/ai/extraction/docx', () => ({
  extractDocxText: vi.fn(async () => 'DOCX_TEXT'),
}));

import {
  resolveHomeworkContext,
  MAX_PINNED_MATERIALS,
} from '@/lib/ai/homework-context';

// Minimal chainable mock: each .from(table) returns a thenable query whose
// terminal .maybeSingle() resolves to the configured row, plus a storage stub.
function makeClient(opts: {
  rows: Record<string, unknown>; // keyed by table name -> single row
  lists?: Record<string, unknown[]>; // keyed by table name -> array (for .eq without maybeSingle)
  download?: () => {
    data: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
    error: unknown;
  };
}) {
  const client = {
    from(table: string) {
      const builder = {
        _table: table,
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle: async () => ({ data: opts.rows[table] ?? null }),
        then: undefined as unknown,
      };
      // Make `await builder` (no maybeSingle) resolve to a list result
      (builder as unknown as { then: (r: (v: unknown) => void) => void }).then =
        (resolve) => resolve({ data: opts.lists?.[table] ?? [] });
      return builder;
    },
    storage: {
      from() {
        return {
          download: async () =>
            opts.download
              ? opts.download()
              : {
                  data: { arrayBuffer: async () => new ArrayBuffer(8) },
                  error: null,
                },
        };
      },
    },
  };
  return client as unknown as Parameters<typeof resolveHomeworkContext>[0];
}

describe('resolveHomeworkContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when the document has no homework session', async () => {
    const c = makeClient({ rows: { homework_sessions: null } });
    expect(await resolveHomeworkContext(c, c, 'doc-x')).toBeNull();
  });

  it('extracts exercise document text (Tier 1)', async () => {
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: 'ex1' },
        documents: {
          title: 'PS1',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Hello exercise' }],
              },
            ],
          },
        },
      },
      lists: { homework_session_materials: [] },
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.exerciseName).toBe('PS1');
    expect(ctx?.exerciseText).toContain('Hello exercise');
    expect(ctx?.pinned).toEqual([]);
  });

  it('extracts a pinned course_material via download + pdf extractor', async () => {
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: null },
        course_materials: {
          file_name: 'Lecture 1',
          storage_path: 'p/x.pdf',
          mime_type: 'application/pdf',
        },
      },
      lists: {
        homework_session_materials: [
          { material_type: 'course_material', material_id: 'm1' },
        ],
      },
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.pinnedNames).toEqual(['Lecture 1']);
    expect(ctx?.pinned[0].text).toBe('PDF_TEXT');
  });

  it('degrades to empty text (keeps name) when download fails', async () => {
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: null },
        personal_files: {
          display_name: 'My Notes',
          storage_path: 'p/y.pdf',
          mime_type: 'application/pdf',
        },
      },
      lists: {
        homework_session_materials: [
          { material_type: 'personal_file', material_id: 'm2' },
        ],
      },
      download: () => ({ data: null, error: new Error('not found') }),
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.pinnedNames).toEqual(['My Notes']);
    expect(ctx?.pinned[0].text).toBe('');
  });

  it('caps the number of pinned materials at MAX_PINNED_MATERIALS', async () => {
    const many = Array.from({ length: MAX_PINNED_MATERIALS + 3 }, (_, i) => ({
      material_type: 'document',
      material_id: `d${i}`,
    }));
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: null },
        documents: { title: 'Doc', content: { type: 'doc', content: [] } },
      },
      lists: { homework_session_materials: many },
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.pinned.length).toBe(MAX_PINNED_MATERIALS);
  });
});
