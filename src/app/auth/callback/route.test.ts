import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockExchangeCodeForSession = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
    },
  }),
}));

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /dashboard on successful code exchange (default)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const request = new Request(
      'http://localhost:3000/auth/callback?code=test-code',
    );
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('test-code');
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/dashboard',
    );
  });

  it('redirects to next param when provided and valid', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const request = new Request(
      'http://localhost:3000/auth/callback?code=test-code&next=/reset-password',
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/reset-password',
    );
  });

  it('ignores absolute URL in next param (open redirect prevention)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const request = new Request(
      'http://localhost:3000/auth/callback?code=test-code&next=https://evil.com/steal',
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/dashboard',
    );
  });

  it('ignores protocol-relative URL in next param (open redirect prevention)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const request = new Request(
      'http://localhost:3000/auth/callback?code=test-code&next=//evil.com/steal',
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/dashboard',
    );
  });

  it('redirects to /login with error when no code provided', async () => {
    const request = new Request('http://localhost:3000/auth/callback');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const url = new URL(response.headers.get('location')!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('auth_failed');
  });

  it('redirects to /login with error when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      error: { message: 'Invalid code' },
    });

    const request = new Request(
      'http://localhost:3000/auth/callback?code=bad-code',
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const url = new URL(response.headers.get('location')!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('auth_failed');
  });
});
