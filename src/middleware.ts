import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const hasPostHog = !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

export async function middleware(request: NextRequest) {
  // PostHog proxy: forward /ingest/* to PostHog without running auth
  if (hasPostHog && request.nextUrl.pathname.startsWith('/ingest')) {
    const { postHogMiddleware } = await import('@posthog/next');
    return postHogMiddleware({ proxy: true })(request);
  }

  // All other routes: Supabase auth first
  const supabaseResponse = await updateSession(request);

  // Optionally wrap with PostHog identity cookie if configured
  if (hasPostHog) {
    const { postHogMiddleware } = await import('@posthog/next');
    return postHogMiddleware({ proxy: true, response: supabaseResponse })(
      request,
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (svg, png, jpg, etc.)
     * - /test routes (dev/test only pages)
     */
    '/((?!_next/static|_next/image|favicon.ico|~offline|manifest\\.webmanifest|test/|supabase/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2)$).*)',
  ],
};
