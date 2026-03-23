import { type NextRequest } from 'next/server';
import { postHogMiddleware } from '@posthog/next';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // PostHog proxy: forward /ingest/* to PostHog without running auth
  if (request.nextUrl.pathname.startsWith('/ingest')) {
    return postHogMiddleware({ proxy: true })(request);
  }

  // All other routes: Supabase auth first, then PostHog identity cookie
  const supabaseResponse = await updateSession(request);
  return postHogMiddleware({ proxy: true, response: supabaseResponse })(
    request,
  );
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
