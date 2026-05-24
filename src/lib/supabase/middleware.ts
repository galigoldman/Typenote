import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session — this is the primary purpose of this middleware.
  // Do NOT remove this line. It revalidates the auth token on every request.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Network errors (e.g. dev server accessed from another device) —
    // treat as unauthenticated rather than crashing the error overlay.
  }

  // Handle OAuth error redirects (e.g. Google consent screen double-callback).
  // GoTrue redirects to /?error=... when OAuth state expires. If the user
  // already has a valid session from the first (successful) callback,
  // send them to the dashboard instead of showing an error.
  if (
    request.nextUrl.searchParams.get('error_code') === 'bad_oauth_state' &&
    user
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Public pages: readable by anyone, logged in or out. The privacy policy
  // MUST stay reachable while logged out — the Chrome Web Store reviewer (and
  // any visitor who clicks the policy link in the extension listing) hits it
  // unauthenticated, and a redirect to /login would fail store review.
  const isPublicPage = request.nextUrl.pathname.startsWith('/privacy');

  // Route protection: unauthenticated users can only access auth pages
  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/forgot-password') ||
    request.nextUrl.pathname.startsWith('/auth');

  if (!user && !isAuthPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated users trying to access auth pages → redirect to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
