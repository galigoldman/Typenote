import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSignInWithOAuth = vi.fn();

vi.mock('./client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

describe('signInWithGoogle', () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save and replace window.location (jsdom doesn't allow direct assignment)
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/signup',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('calls signInWithOAuth with skipBrowserRedirect: true', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?...' },
      error: null,
    });

    const { signInWithGoogle } = await import('./oauth');
    await signInWithGoogle();

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback',
        skipBrowserRedirect: true,
      },
    });
  });

  it('sets window.location.href to the OAuth URL on success', async () => {
    const oauthUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc';
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: oauthUrl },
      error: null,
    });

    const { signInWithGoogle } = await import('./oauth');
    await signInWithGoogle();

    expect(window.location.href).toBe(oauthUrl);
  });

  it('redirects to login with error when signInWithOAuth fails', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: { message: 'Something went wrong' },
    });

    const { signInWithGoogle } = await import('./oauth');
    await signInWithGoogle();

    expect(window.location.href).toBe('/login?error=oauth_init_failed');
  });

  it('redirects to login with error when no URL is returned', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: null,
    });

    const { signInWithGoogle } = await import('./oauth');
    await signInWithGoogle();

    expect(window.location.href).toBe('/login?error=oauth_init_failed');
  });
});
