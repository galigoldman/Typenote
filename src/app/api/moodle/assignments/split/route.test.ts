/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock supabase server client (user-scoped) ---
const mockGetUser = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

// --- Mock admin client ---
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

// --- Mock rate-limit helper ---
const mockCheckAndIncrement = vi.fn();
vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrementUsage: (...args: unknown[]) =>
    mockCheckAndIncrement(...args),
}));

// --- Mock AI split helper ---
const mockSplitAssignmentWithAi = vi.fn();
vi.mock('@/lib/ai/split-assignment', () => ({
  splitAssignmentWithAi: (...args: unknown[]) =>
    mockSplitAssignmentWithAi(...args),
}));

import { POST } from './route';

function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/moodle/assignments/split', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { assignmentId: 'assignment-abc' };

/** Build a chainable admin mock that handles the select→eq→single and insert→select→single patterns. */
function makeAdminFromMock(
  assignmentRow: Record<string, unknown> | null,
  splitRow: { id: string } | null,
) {
  return vi.fn((table: string) => {
    if (table === 'moodle_assignments') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: assignmentRow,
              error: assignmentRow ? null : { message: 'Not found' },
            }),
          }),
        }),
      };
    }
    if (table === 'assignment_splits') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: splitRow,
              error: splitRow ? null : { message: 'Insert failed' },
            }),
          }),
        }),
      };
    }
    if (table === 'split_questions') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });
}

describe('POST /api/moodle/assignments/split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. 401 when not authenticated
  // -----------------------------------------------------------------------
  it('returns 401 when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(createRequest(validBody) as any);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
    expect(mockSplitAssignmentWithAi).not.toHaveBeenCalled();
  });

  it('returns 401 when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const res = await POST(createRequest(validBody) as any);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  // -----------------------------------------------------------------------
  // 2. 429 when quota is exhausted
  // -----------------------------------------------------------------------
  it('returns 429 when the user quota is exhausted', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockAdminFrom.mockImplementation(
      makeAdminFromMock(
        { id: 'assignment-abc', description_html: '<p>Q1</p>', content_version: 1 },
        { id: 'split-xyz' },
      ),
    );

    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 51,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: false,
    });

    const res = await POST(createRequest(validBody) as any);
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe('rate_limited');
    expect(data.used).toBe(51);
    expect(data.limit).toBe(50);
    expect(data.resetsAt).toBeDefined();
    expect(mockSplitAssignmentWithAi).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. 200 with splitId on success
  // -----------------------------------------------------------------------
  it('returns 200 with splitId and questionCount on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockAdminFrom.mockImplementation(
      makeAdminFromMock(
        { id: 'assignment-abc', description_html: '<p>Q1</p><p>Q2</p>', content_version: 2 },
        { id: 'split-xyz' },
      ),
    );

    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 5,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });

    mockSplitAssignmentWithAi.mockResolvedValue([
      { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 10 },
      { label: '2', position: 1, boundaryStart: 10, boundaryEnd: 20 },
    ]);

    const res = await POST(createRequest(validBody) as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.splitId).toBe('split-xyz');
    expect(data.questionCount).toBe(2);
    expect(mockCheckAndIncrement).toHaveBeenCalledWith('user-123', 'flash');
    expect(mockSplitAssignmentWithAi).toHaveBeenCalledWith('<p>Q1</p><p>Q2</p>');
  });

  // -----------------------------------------------------------------------
  // 4. 400 when assignmentId is missing
  // -----------------------------------------------------------------------
  it('returns 400 when assignmentId is missing', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const res = await POST(createRequest({}) as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('assignmentId');
  });

  // -----------------------------------------------------------------------
  // 5. 404 when assignment does not exist
  // -----------------------------------------------------------------------
  it('returns 404 when the assignment is not found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockAdminFrom.mockImplementation(makeAdminFromMock(null, null));

    const res = await POST(createRequest(validBody) as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Assignment not found');
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. 503 when rate limit check throws
  // -----------------------------------------------------------------------
  it('returns 503 when rate limit check throws (fail-closed)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockAdminFrom.mockImplementation(
      makeAdminFromMock(
        { id: 'assignment-abc', description_html: '<p>Q1</p>', content_version: 1 },
        { id: 'split-xyz' },
      ),
    );

    mockCheckAndIncrement.mockRejectedValue(new Error('DB connection failed'));

    const res = await POST(createRequest(validBody) as any);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toBe('service_unavailable');
    expect(mockSplitAssignmentWithAi).not.toHaveBeenCalled();
  });
});
