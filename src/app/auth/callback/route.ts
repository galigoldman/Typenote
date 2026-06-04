import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  // Validate redirect target: must be a relative path starting with /
  // to prevent open redirect attacks (OWASP)
  const redirectTo =
    next && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/dashboard';

  if (code) {
    const cookieStore = await cookies();

    // Track cookies that need to be set on the redirect response
    const cookiesToForward: {
      name: string;
      value: string;
      options: Record<string, unknown>;
    }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookiesToForward.push({ name, value, options });
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    console.log('[auth/callback] exchangeCodeForSession result:', {
      error: error?.message ?? null,
      cookieCount: cookiesToForward.length,
    });

    if (!error) {
      const response = NextResponse.redirect(`${origin}${redirectTo}`);
      // Forward auth cookies onto the redirect response
      cookiesToForward.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    }

    // Code was present but exchange failed (e.g. PKCE verifier lost on Safari)
    console.error('[auth/callback] session exchange failed:', error.message);
    return NextResponse.redirect(
      `${origin}/login?error=session_exchange_failed`,
    );
  }

  // No authorization code in the URL at all
  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
