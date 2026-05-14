/**
 * Input-validation tests for GET /api/ai/search.
 *
 * The route is the RAG entry point — callers pass `query` and `courseId`
 * (plus optional `weekId`, `maxResults`). Bad inputs must return 4xx
 * BEFORE touching `searchContext`, otherwise a malformed call could
 * trigger a costly embedding lookup or DB scan on every request.
 *
 * Mirrors the existing `src/app/api/ai/ask/validation.test.ts` pattern:
 * mock `searchContext` at module level, then drive the route with
 * various URLs and assert response status + error shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchContext = vi.fn();
vi.mock('@/lib/actions/ai-context', () => ({
  searchContext: (...args: unknown[]) => mockSearchContext(...args),
}));

import { GET } from './route';

function makeReq(query: Record<string, string>): Request {
  const url = new URL('http://test/api/ai/search');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url, { method: 'GET' });
}

describe('GET /api/ai/search — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchContext.mockResolvedValue([]);
  });

  it('rejects missing query with 400', async () => {
    const res = await GET(makeReq({ courseId: 'c1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/query/i);
    expect(mockSearchContext).not.toHaveBeenCalled();
  });

  it('rejects empty/whitespace-only query with 400', async () => {
    const res = await GET(makeReq({ query: '   ', courseId: 'c1' }));
    expect(res.status).toBe(400);
    expect(mockSearchContext).not.toHaveBeenCalled();
  });

  it('rejects missing courseId with 400', async () => {
    const res = await GET(makeReq({ query: 'derivative' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/courseId/i);
    expect(mockSearchContext).not.toHaveBeenCalled();
  });

  it('rejects non-integer maxResults with 400', async () => {
    const res = await GET(
      makeReq({ query: 'q', courseId: 'c1', maxResults: 'banana' }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/maxResults/i);
    expect(mockSearchContext).not.toHaveBeenCalled();
  });

  it('rejects negative or zero maxResults with 400', async () => {
    const res = await GET(
      makeReq({ query: 'q', courseId: 'c1', maxResults: '0' }),
    );
    expect(res.status).toBe(400);
    expect(mockSearchContext).not.toHaveBeenCalled();
  });

  it('accepts a valid request and trims the query before passing it on', async () => {
    mockSearchContext.mockResolvedValue([{ id: 'x', sourceName: 'lec01.pdf' }]);
    const res = await GET(makeReq({ query: '  derivative  ', courseId: 'c1' }));
    expect(res.status).toBe(200);
    expect(mockSearchContext).toHaveBeenCalledWith({
      query: 'derivative',
      courseId: 'c1',
      weekId: undefined,
      maxResults: undefined,
    });
  });

  it('forwards weekId and maxResults when provided', async () => {
    mockSearchContext.mockResolvedValue([]);
    await GET(
      makeReq({
        query: 'q',
        courseId: 'c1',
        weekId: 'w1',
        maxResults: '5',
      }),
    );
    expect(mockSearchContext).toHaveBeenCalledWith({
      query: 'q',
      courseId: 'c1',
      weekId: 'w1',
      maxResults: 5,
    });
  });

  it('maps an "Unauthorized" thrown by searchContext to a 401 response', async () => {
    mockSearchContext.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeReq({ query: 'q', courseId: 'c1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/unauth/i);
  });

  it('maps any other thrown error to a 500 without leaking the message', async () => {
    mockSearchContext.mockRejectedValue(new Error('internal connection wat'));
    const res = await GET(makeReq({ query: 'q', courseId: 'c1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    // The route returns a generic "Failed to search context" — the raw
    // error message must NOT leak to the client.
    expect(data.error).not.toContain('connection wat');
  });
});
