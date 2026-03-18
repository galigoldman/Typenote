import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase server client
const mockGetUser = vi.fn();
const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => {
    // Chain mock for .from().select().eq().single(), .from().insert().select().single(), .from().update().eq()
    const chainMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'conv-mock', title: 'test' },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    mockSupabaseFrom.mockReturnValue(chainMock);
    return Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockSupabaseFrom,
    });
  }),
}));

// Mock rate-limit helper
const mockCheckAndIncrement = vi.fn();
vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrementUsage: (...args: unknown[]) =>
    mockCheckAndIncrement(...args),
}));

// Mock buildAiContext to prevent actual AI calls
const mockBuildAiContext = vi.fn();
vi.mock('@/lib/actions/ai-context', () => ({
  buildAiContext: (...args: unknown[]) => mockBuildAiContext(...args),
}));

// Mock GoogleGenAI
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      generateContentStream: vi.fn(),
    },
  })),
}));

import { POST } from './route';

function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  question: 'What is 2+2?',
  courseId: 'course-123',
  mode: 'quick',
};

describe('POST /api/ai/ask — rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  it('returns 429 when user has exceeded monthly limit', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 51,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: false,
    });

    const res = await POST(createRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe('rate_limited');
    expect(data.message).toContain('50');
    expect(data.used).toBe(51);
    expect(data.limit).toBe(50);
    expect(data.resetsAt).toBeDefined();

    // buildAiContext should NOT be called when rate limited
    expect(mockBuildAiContext).not.toHaveBeenCalled();
  });

  it('returns 503 when rate limit check fails (fail-closed)', async () => {
    mockCheckAndIncrement.mockRejectedValue(
      new Error('Database connection failed'),
    );

    const res = await POST(createRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toBe('service_unavailable');
    expect(data.message).toContain('temporarily unavailable');

    // buildAiContext should NOT be called when rate limit check fails
    expect(mockBuildAiContext).not.toHaveBeenCalled();
  });

  it('proceeds to AI when user has remaining quota', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 5,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });

    // Mock buildAiContext to return valid data
    mockBuildAiContext.mockResolvedValue({
      systemPrompt: 'You are a tutor.',
      contents: [{ role: 'user', parts: [{ text: 'What is 2+2?' }] }],
      modelName: 'gemini-2.5-flash',
      sources: [],
    });

    // The response will fail at the GoogleGenAI mock level since we
    // didn't fully mock the streaming, but the important thing is that
    // buildAiContext WAS called (meaning rate limit passed)
    await POST(createRequest(validBody));

    expect(mockBuildAiContext).toHaveBeenCalled();
  });

  it('passes the correct model to checkAndIncrementUsage', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 1,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });

    mockBuildAiContext.mockResolvedValue({
      systemPrompt: '',
      contents: [],
      modelName: 'gemini-2.5-pro',
      sources: [],
    });

    await POST(createRequest({ ...validBody, mode: 'deep' }));

    expect(mockCheckAndIncrement).toHaveBeenCalledWith('user-123', 'deep');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await POST(createRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');

    // Neither rate limit nor AI should be called
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
    expect(mockBuildAiContext).not.toHaveBeenCalled();
  });
});
