import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/latex', () => ({
  convertToLatex: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/ai/rate-limit', () => ({
  checkAndIncrementUsage: vi.fn(),
  recordTokenUsage: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from './route';
import { convertToLatex } from '@/lib/ai/latex';
import { createClient } from '@/lib/supabase/server';
import { checkAndIncrementUsage, recordTokenUsage } from '@/lib/ai/rate-limit';

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
    monthlyLimit: 500,
    tier: 'beta',
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

  it('should pass latex query type to rate limiter', async () => {
    vi.mocked(convertToLatex).mockResolvedValue('x^2');

    await POST(createRequest({ text: 'x squared' }));

    expect(checkAndIncrementUsage).toHaveBeenCalledWith('u1', 'flash', 'latex');
  });

  it('should accept optional courseName', async () => {
    vi.mocked(convertToLatex).mockResolvedValue('\\det(A)');

    const res = await POST(
      createRequest({ text: 'determinant of A', courseName: 'Linear Algebra' }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(convertToLatex).toHaveBeenCalledWith(
      'determinant of A',
      'Linear Algebra',
    );
    expect(data.latex).toBe('\\det(A)');
  });

  it('should work without courseName', async () => {
    vi.mocked(convertToLatex).mockResolvedValue('x^2');

    const res = await POST(createRequest({ text: 'x squared' }));

    expect(res.status).toBe(200);
    expect(convertToLatex).toHaveBeenCalledWith('x squared', undefined);
  });

  it('should call recordTokenUsage after conversion', async () => {
    vi.mocked(convertToLatex).mockResolvedValue('x^2');

    await POST(createRequest({ text: 'x squared' }));

    expect(recordTokenUsage).toHaveBeenCalledWith('u1', 'latex', 0, 0);
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

  it('should return 400 when courseName exceeds 200 characters', async () => {
    const res = await POST(
      createRequest({ text: 'test', courseName: 'a'.repeat(201) }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe(
      'courseName must be a string of 200 characters or less',
    );
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

  it('should return 429 with LaTeX-specific message when quota exceeded', async () => {
    vi.mocked(checkAndIncrementUsage).mockResolvedValue({
      currentCount: 501,
      monthlyLimit: 500,
      tier: 'beta',
      isAllowed: false,
    });

    const res = await POST(createRequest({ text: 'test' }));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe('Monthly LaTeX quota exceeded');
    expect(data.quota.tier).toBe('beta');
  });

  it('should return 500 when conversion fails', async () => {
    vi.mocked(convertToLatex).mockRejectedValue(new Error('fail'));

    const res = await POST(createRequest({ text: 'test' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to convert to LaTeX');
  });
});
