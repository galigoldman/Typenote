import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/latex', () => ({
  convertToLatex: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrementUsage: vi.fn(),
}));

import { POST } from './route';
import { convertToLatex } from '@/lib/ai/latex';
import { createClient } from '@/lib/supabase/server';
import { checkAndIncrementUsage } from '@/lib/ai/rate-limit';

function createRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/latex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Set up mocks so auth + rate limit pass by default */
function setupAuthMocks() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    },
  } as never);
  vi.mocked(checkAndIncrementUsage).mockResolvedValue({
    currentCount: 1,
    monthlyLimit: 50,
    tier: 'free',
    isAllowed: true,
  });
}

describe('POST /api/ai/latex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthMocks();
  });

  it('should return 200 with latex for valid input', async () => {
    vi.mocked(convertToLatex).mockResolvedValue('\\frac{1}{2} \\times 5');

    const res = await POST(createRequest({ text: 'one half times five' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.latex).toBe('\\frac{1}{2} \\times 5');
  });

  it('should return 400 when text is missing', async () => {
    const res = await POST(createRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Text is required');
  });

  it('should return 400 when text is empty', async () => {
    const res = await POST(createRequest({ text: '' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Text is required');
  });

  it('should return 400 when text exceeds 500 characters', async () => {
    const res = await POST(createRequest({ text: 'a'.repeat(501) }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Text must be 500 characters or less');
  });

  it('should return 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);

    const res = await POST(createRequest({ text: 'test' }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 429 when quota exceeded', async () => {
    vi.mocked(checkAndIncrementUsage).mockResolvedValue({
      currentCount: 51,
      monthlyLimit: 50,
      tier: 'free',
      isAllowed: false,
    });

    const res = await POST(createRequest({ text: 'test' }));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe('Monthly AI quota exceeded');
  });

  it('should return 500 when conversion fails', async () => {
    vi.mocked(convertToLatex).mockRejectedValue(new Error('fail'));

    const res = await POST(createRequest({ text: 'test' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to convert to LaTeX');
  });
});
