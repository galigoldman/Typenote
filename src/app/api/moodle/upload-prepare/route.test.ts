import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type StorageListResult = {
  data: Array<{ name: string }> | null;
  error: { message: string } | null;
};
type SignedUploadResult = {
  data: { signedUrl: string; token: string } | null;
  error: { message: string } | null;
};

function buildAdminClient(opts: {
  sectionData?: unknown;
  sectionError?: { message: string } | null;
  listResult?: StorageListResult;
  signedResult?: SignedUploadResult;
}) {
  const sectionEq = vi.fn().mockReturnThis();
  const sectionSingle = vi.fn().mockResolvedValue({
    data: opts.sectionData ?? {
      course_id: 'course-1',
      moodle_courses: {
        instance_id: 'inst-1',
        moodle_course_id: 'mc-1',
        moodle_instances: { domain: 'moodle.example.org' },
      },
    },
    error: opts.sectionError ?? null,
  });
  const sectionSelect = vi.fn(() => ({
    eq: sectionEq,
    single: sectionSingle,
  }));
  sectionEq.mockReturnValue({ single: sectionSingle });

  const storageList = vi
    .fn()
    .mockResolvedValue(opts.listResult ?? { data: [], error: null });
  const createSignedUploadUrl = vi.fn().mockResolvedValue(
    opts.signedResult ?? {
      data: { signedUrl: 'https://signed.example/put', token: 'tok' },
      error: null,
    },
  );

  return {
    from: vi.fn(() => ({ select: sectionSelect })),
    storage: {
      from: vi.fn(() => ({
        list: storageList,
        createSignedUploadUrl,
      })),
    },
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    },
    __spies: { storageList, createSignedUploadUrl, sectionSingle },
  };
}

function setupAuth(admin: ReturnType<typeof buildAdminClient>) {
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
  return new Request('http://localhost:3000/api/moodle/upload-prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  sectionId: 'sec-1',
  fileName: 'lecture.pdf',
  contentHash: 'abc123',
};

describe('POST /api/moodle/upload-prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns signed upload URL when object does not yet exist', async () => {
    const admin = buildAdminClient({
      listResult: { data: [], error: null },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.uploadUrl).toBe('https://signed.example/put');
    expect(data.token).toBe('tok');
    expect(data.storagePath).toBe('moodle.example.org/mc-1/abc123.pdf');
    expect(data.alreadyUploaded).toBeUndefined();
    expect(admin.__spies.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('short-circuits with alreadyUploaded when object exists in storage', async () => {
    const admin = buildAdminClient({
      listResult: { data: [{ name: 'abc123.pdf' }], error: null },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.alreadyUploaded).toBe(true);
    expect(data.storagePath).toBe('moodle.example.org/mc-1/abc123.pdf');
    expect(data.uploadUrl).toBeUndefined();
    // Must not waste a signed URL when the bytes are already there.
    expect(admin.__spies.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('treats a race-condition 409 as alreadyUploaded instead of 500', async () => {
    const admin = buildAdminClient({
      listResult: { data: [], error: null },
      signedResult: {
        data: null,
        error: { message: 'The resource already exists' },
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.alreadyUploaded).toBe(true);
    expect(data.storagePath).toBe('moodle.example.org/mc-1/abc123.pdf');
  });

  it('still returns 500 for unrelated storage errors', async () => {
    const admin = buildAdminClient({
      listResult: { data: [], error: null },
      signedResult: {
        data: null,
        error: { message: 'Network unreachable' },
      },
    });
    setupAuth(admin);

    const res = await POST(makeRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('Network unreachable');
  });

  it('returns 400 when required fields are missing', async () => {
    const admin = buildAdminClient({});
    setupAuth(admin);

    const res = await POST(
      makeRequest({ sectionId: 'sec-1', fileName: 'x.pdf' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
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

    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(401);
  });
});
