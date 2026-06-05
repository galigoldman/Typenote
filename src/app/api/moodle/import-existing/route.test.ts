import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/actions/moodle-sync', () => ({
  recordUserFileImport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/actions/ai-context', () => ({
  indexContent: vi.fn().mockResolvedValue({ success: true, skipped: true }),
}));

// Default: no existing embedding, so a claim schedules a background index.
// Tests that exercise the skip-when-already-indexed path override this per-case.
vi.mock('@/lib/queries/embeddings', () => ({
  getContentHash: vi.fn().mockResolvedValue(null),
}));

// Run scheduled background work synchronously so indexContent assertions hold.
// One test overrides this with a capturing mock to prove the response does not
// wait on indexing.
vi.mock('@/lib/server/after-response', () => ({
  scheduleAfterResponse: vi.fn((work: () => Promise<void>) => {
    void work();
  }),
}));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordUserFileImport } from '@/lib/actions/moodle-sync';
import { indexContent } from '@/lib/actions/ai-context';
import { getContentHash } from '@/lib/queries/embeddings';
import { scheduleAfterResponse } from '@/lib/server/after-response';

type FileRow = {
  id: string;
  storage_path: string | null;
  content_hash: string | null;
  file_size: number | null;
  mime_type: string | null;
};

function buildAdmin(opts: {
  file?: FileRow | null;
  sectionCourseId?: string | null;
  syncCourseId?: string | null;
}) {
  const fileSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.file ?? null, error: null });
  const sectionSingle = vi.fn().mockResolvedValue({
    data: opts.sectionCourseId
      ? { course_id: opts.sectionCourseId }
      : opts.sectionCourseId === null
        ? null
        : { course_id: 'mc-1' },
    error: null,
  });
  const syncSingle = vi.fn().mockResolvedValue({
    data: opts.syncCourseId
      ? { course_id: opts.syncCourseId }
      : opts.syncCourseId === null
        ? null
        : { course_id: 'tn-course-1' },
    error: null,
  });

  function chain(single: ReturnType<typeof vi.fn>) {
    const eq2 = vi.fn().mockReturnValue({ maybeSingle: single });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle: single });
    return {
      select: vi.fn().mockReturnValue({ eq: eq1, maybeSingle: single }),
    };
  }

  const tables: Record<string, ReturnType<typeof chain>> = {
    moodle_files: chain(fileSingle),
    moodle_sections: chain(sectionSingle),
    user_course_syncs: chain(syncSingle),
  };

  return {
    from: vi.fn((name: string) => tables[name]),
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    },
  };
}

function setupAuth(admin: ReturnType<typeof buildAdmin>) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    },
  } as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/moodle/import-existing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const body = {
  sectionId: 'sec-1',
  moodleUrl: 'https://moodle.example.org/mod/resource/view.php?id=1',
  observedSize: 12345,
};

describe('POST /api/moodle/import-existing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports for the user when size matches the registry', async () => {
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'abc',
        file_size: 12345,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(true);
    expect(data.fileId).toBe('file-1');
    expect(data.storagePath).toBe('m.org/c1/abc.pdf');
    expect(data.deduplicated).toBe(true);
    expect(recordUserFileImport).toHaveBeenCalledWith('u1', 'file-1', 'mc-1');
    expect(indexContent).toHaveBeenCalledWith({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'tn-course-1',
      triggeredByUserId: 'u1',
    });
  });

  it('refuses when the registry has no row for this (section, url)', async () => {
    const admin = buildAdmin({ file: null });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(false);
    expect(data.reason).toBe('not_in_registry');
    expect(recordUserFileImport).not.toHaveBeenCalled();
  });

  it('refuses when the registry row has no storage_path', async () => {
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: null,
        content_hash: null,
        file_size: null,
        mime_type: null,
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(data.imported).toBe(false);
    expect(data.reason).toBe('not_in_registry');
  });

  it('claims even when file_size is unknown, as long as bytes are stored', async () => {
    // file_size is metadata; storage_path + content_hash prove we have the
    // bytes. Claim-from-registry no longer gates on size.
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'abc',
        file_size: null,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(data.imported).toBe(true);
    expect(recordUserFileImport).toHaveBeenCalledWith('u1', 'file-1', 'mc-1');
  });

  it('claims regardless of observedSize differing from the stored size', async () => {
    // Deliberate tradeoff: we do NOT re-verify size against Moodle. A stored
    // file (storage_path + content_hash) is claimed even when the HEAD-observed
    // size differs, so a second user skips the download. A replaced file is
    // picked up by a future change-detecting re-sync, not here.
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'abc',
        file_size: 9999,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(data.imported).toBe(true);
    expect(data.deduplicated).toBe(true);
    expect(recordUserFileImport).toHaveBeenCalledWith('u1', 'file-1', 'mc-1');
  });

  it('skips re-indexing when an embedding already exists at the registry hash', async () => {
    // The expensive part of a "dedup" claim is indexContent downloading +
    // hashing the file. When an embedding already exists at the same content
    // hash, the claim must skip it — that is the speed fix for a second user's
    // sync of an already-indexed course.
    vi.mocked(getContentHash).mockResolvedValueOnce('abc'); // matches file.content_hash
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'abc',
        file_size: 12345,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(data.imported).toBe(true);
    expect(recordUserFileImport).toHaveBeenCalledWith('u1', 'file-1', 'mc-1');
    // The whole point: no re-index when embeddings are already present + current.
    expect(indexContent).not.toHaveBeenCalled();
  });

  it('re-indexes when the existing embedding hash is stale', async () => {
    vi.mocked(getContentHash).mockResolvedValueOnce('OLD-HASH'); // != file.content_hash
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'abc',
        file_size: 12345,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(data.imported).toBe(true);
    expect(indexContent).toHaveBeenCalledWith({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'tn-course-1',
      triggeredByUserId: 'u1',
    });
  });

  it('does not claim a registry row that has no content hash (not materialized)', async () => {
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: null,
        file_size: 100,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(body) as never);
    const data = await res.json();

    expect(data.imported).toBe(false);
    expect(data.reason).toBe('not_materialized');
    expect(recordUserFileImport).not.toHaveBeenCalled();
  });

  it('returns 400 when sectionId or moodleUrl is missing', async () => {
    const admin = buildAdmin({});
    setupAuth(admin);

    const res = await POST(makeRequest({ sectionId: 'sec-1' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);

    const res = await POST(makeRequest(body) as never);
    expect(res.status).toBe(401);
  });

  it('awaits indexing before returning the response', async () => {
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'abc',
        file_size: 12345, // must match body.observedSize so the route indexes
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    // Capture the scheduled work instead of running it, to prove the response
    // does NOT wait on indexing.
    let scheduled: (() => Promise<void>) | null = null;
    vi.mocked(scheduleAfterResponse).mockImplementationOnce((work) => {
      scheduled = work;
    });
    // indexContent would hang forever if (wrongly) awaited inline.
    vi.mocked(indexContent).mockReturnValueOnce(new Promise(() => {}) as never);

    const res = await POST(makeRequest(body) as never);

    // Response returns immediately even though indexing hasn't run.
    expect(res.status).toBe(200);
    expect(indexContent).not.toHaveBeenCalled();
    // Indexing was scheduled for after the response.
    expect(scheduleAfterResponse).toHaveBeenCalledTimes(1);
    expect(scheduled).toBeTypeOf('function');
  });
});
