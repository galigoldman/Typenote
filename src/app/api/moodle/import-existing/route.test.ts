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

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordUserFileImport } from '@/lib/actions/moodle-sync';
import { indexContent } from '@/lib/actions/ai-context';

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

  it('refuses with size_unknown when registry has no file_size', async () => {
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

    expect(data.imported).toBe(false);
    expect(data.reason).toBe('size_unknown');
  });

  it('refuses with size_changed when observedSize disagrees with registry', async () => {
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

    expect(data.imported).toBe(false);
    expect(data.reason).toBe('size_changed');
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

    let resolveIndex!: () => void;
    const gate = new Promise<{ success: boolean; skipped: boolean }>(
      (resolve) => {
        resolveIndex = () => resolve({ success: true, skipped: false });
      },
    );
    vi.mocked(indexContent).mockReturnValueOnce(gate as never);

    const respPromise = POST(makeRequest(body) as never);

    // Let microtasks run: indexContent should have been dispatched...
    await new Promise((r) => setImmediate(r));
    let settled = false;
    void respPromise.then(() => {
      settled = true;
    });
    await new Promise((r) => setImmediate(r));
    // ...but the response must NOT have resolved yet (proves we await).
    expect(settled).toBe(false);

    resolveIndex();
    const res = await respPromise;
    expect(res.status).toBe(200);
    expect(indexContent).toHaveBeenCalledWith({
      type: 'moodle_file',
      fileId: 'file-1',
      courseId: 'tn-course-1',
    });
  });
});
