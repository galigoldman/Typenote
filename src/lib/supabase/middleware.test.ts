import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Control the user returned by Supabase's getUser() per-test. vi.hoisted keeps
// the holder safe to reference inside the hoisted vi.mock factory below.
const supabaseState = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: supabaseState.user } }),
    },
  }),
}));

import { updateSession } from './middleware';

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`));
}

describe('updateSession route protection', () => {
  beforeEach(() => {
    supabaseState.user = null;
  });

  it('lets logged-out visitors read /privacy (public legal page)', async () => {
    supabaseState.user = null;

    const res = await updateSession(requestFor('/privacy'));

    // A NextResponse.next() carries no Location header; a redirect would.
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects logged-out visitors away from protected pages to /login', async () => {
    supabaseState.user = null;

    const res = await updateSession(requestFor('/dashboard'));

    expect(res.headers.get('location')).toContain('/login');
  });

  it('does not bounce logged-in users away from /privacy', async () => {
    supabaseState.user = { id: 'user-1' };

    const res = await updateSession(requestFor('/privacy'));

    expect(res.headers.get('location')).toBeNull();
  });
});
