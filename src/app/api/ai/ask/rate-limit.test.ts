import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase server client
const mockGetUser = vi.fn();
const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => {
    // Don't override mockSupabaseFrom here — let beforeEach / individual tests set it up
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

vi.mock('@/lib/ai/usage-events', () => ({
  recordAiEvent: vi.fn().mockResolvedValue(undefined),
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

/** Helper to set up profiles mock for tier check */
function mockProfilesTier(tier: string) {
  // The deep mode check queries profiles.subscription_tier
  // We need the from('profiles').select(...).eq(...).single() chain to return the tier
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { subscription_tier: tier },
              error: null,
            }),
          }),
        }),
      };
    }
    // Default chain for other tables (conversations, messages)
    return {
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
  });
}

/** Default supabase from() chain for conversations/messages */
function setupDefaultFromMock() {
  const defaultChain = {
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
  mockSupabaseFrom.mockReturnValue(defaultChain);
}

describe('POST /api/ai/ask — rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    setupDefaultFromMock();
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

    expect(mockBuildAiContext).not.toHaveBeenCalled();
  });

  it('proceeds to AI when user has remaining quota', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 5,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });

    mockBuildAiContext.mockResolvedValue({
      systemPrompt: 'You are a tutor.',
      contents: [{ role: 'user', parts: [{ text: 'What is 2+2?' }] }],
      modelName: 'gemini-2.5-flash',
      sources: [],
    });

    await POST(createRequest(validBody));

    expect(mockBuildAiContext).toHaveBeenCalled();
  });

  it('passes queryType chat to checkAndIncrementUsage', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 1,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: true,
    });

    mockBuildAiContext.mockResolvedValue({
      systemPrompt: '',
      contents: [],
      modelName: 'gemini-2.5-flash',
      sources: [],
    });

    await POST(createRequest(validBody));

    expect(mockCheckAndIncrement).toHaveBeenCalledWith(
      'user-123',
      'quick',
      'chat',
    );
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

    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
    expect(mockBuildAiContext).not.toHaveBeenCalled();
  });

  // --- Deep mode restriction tests ---

  it('returns 403 when beta user requests deep mode', async () => {
    // Must set up profiles mock BEFORE calling the route
    // The route creates a new supabase client, so we need the mock factory to return it
    const profilesMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { subscription_tier: 'beta' },
            error: null,
          }),
        }),
      }),
    };
    const defaultChain = {
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
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: 'c1' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    mockSupabaseFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profilesMock : defaultChain,
    );

    const res = await POST(createRequest({ ...validBody, mode: 'deep' }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe('deep_mode_restricted');
    expect(data.message).toContain('Pro plan');
    expect(data.tier).toBe('beta');

    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
    expect(mockBuildAiContext).not.toHaveBeenCalled();
  });

  it('returns 403 when free user requests deep mode', async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { subscription_tier: 'free' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    const res = await POST(createRequest({ ...validBody, mode: 'deep' }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe('deep_mode_restricted');
    expect(data.tier).toBe('free');
  });

  it('allows deep mode for pro user', async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { subscription_tier: 'pro' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
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
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: 'c1' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 1,
      monthlyLimit: 500,
      tier: 'pro',
      isAllowed: true,
    });
    mockBuildAiContext.mockResolvedValue({
      systemPrompt: '',
      contents: [],
      modelName: 'gemini-2.5-pro',
      sources: [],
    });

    await POST(createRequest({ ...validBody, mode: 'deep' }));

    expect(mockCheckAndIncrement).toHaveBeenCalledWith(
      'user-123',
      'deep',
      'chat',
    );
    expect(mockBuildAiContext).toHaveBeenCalled();
  });

  it('beta user at query 100 is allowed', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 100,
      monthlyLimit: 100,
      tier: 'beta',
      isAllowed: true,
    });
    mockBuildAiContext.mockResolvedValue({
      systemPrompt: '',
      contents: [],
      modelName: 'gemini-2.5-flash',
      sources: [],
    });

    await POST(createRequest(validBody));

    expect(mockBuildAiContext).toHaveBeenCalled();
  });

  it('beta user at query 101 is rate limited', async () => {
    mockCheckAndIncrement.mockResolvedValue({
      currentCount: 101,
      monthlyLimit: 100,
      tier: 'beta',
      isAllowed: false,
    });

    const res = await POST(createRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe('rate_limited');
    expect(data.limit).toBe(100);
  });
});
