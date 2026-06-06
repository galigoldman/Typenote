import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase server client (route reads auth before validation in some
// branches, so always provide a usable mock).
const mockGetUser = vi.fn();
const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockSupabaseFrom,
    }),
  ),
}));

const mockCheckAndIncrement = vi.fn();
vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrementUsage: (...args: unknown[]) =>
    mockCheckAndIncrement(...args),
}));

vi.mock('@/lib/ai/usage-events', () => ({
  recordAiEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/actions/ai-context', () => ({
  buildAiContext: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContentStream: vi.fn() },
  })),
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://test/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/ask — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default auth — covers cases where validation happens before auth check
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('rejects missing question with 400', async () => {
    const res = await POST(makeRequest({ mode: 'quick' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/question/i);
  });

  it('rejects empty-string question with 400', async () => {
    const res = await POST(makeRequest({ question: '   ', mode: 'quick' }));
    expect(res.status).toBe(400);
  });

  it('rejects non-string question with 400', async () => {
    const res = await POST(makeRequest({ question: 42, mode: 'quick' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing mode with 400', async () => {
    const res = await POST(makeRequest({ question: 'hi' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/mode/i);
  });

  it('rejects mode that is not "quick" or "deep" with 400', async () => {
    const res = await POST(makeRequest({ question: 'hi', mode: 'super-deep' }));
    expect(res.status).toBe(400);
  });

  it('rejects non-string courseId with 400', async () => {
    const res = await POST(
      makeRequest({ question: 'hi', mode: 'quick', courseId: 42 }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/courseId/i);
  });

  it('rejects non-array conversationHistory with 400', async () => {
    const res = await POST(
      makeRequest({
        question: 'hi',
        mode: 'quick',
        conversationHistory: 'not-an-array',
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/conversationHistory/i);
  });

  it('rejects conversationHistory entries with invalid role with 400', async () => {
    const res = await POST(
      makeRequest({
        question: 'hi',
        mode: 'quick',
        conversationHistory: [{ role: 'robot', content: 'hello' }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-string imageData with 400', async () => {
    const res = await POST(
      makeRequest({ question: 'hi', mode: 'quick', imageData: 123 }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/imageData/i);
  });

  it('rejects imageData exceeding ~4MB cap with 400', async () => {
    // Base64 cap is 5_300_000 chars
    const big = 'a'.repeat(5_300_001);
    const res = await POST(
      makeRequest({ question: 'hi', mode: 'quick', imageData: big }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/imageData/i);
  });

  it('rejects unauthenticated request with 401 (validation passes first)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest({ question: 'hi', mode: 'quick' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ai/ask — conversation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockCheckAndIncrement.mockResolvedValue({
      isAllowed: true,
      currentCount: 1,
      monthlyLimit: 100,
      tier: 'beta',
    });
  });

  it('returns 404 when the conversationId does not belong to the user', async () => {
    // Simulate the ownership check: ai_conversations.select returns no row
    const fromSpy = (table: string) => {
      if (table === 'ai_conversations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    };
    mockSupabaseFrom.mockImplementation(fromSpy);

    const res = await POST(
      makeRequest({
        question: 'hi',
        mode: 'quick',
        conversationId: '11111111-2222-3333-4444-555555555555',
      }),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/Conversation not found/);
  });
});
