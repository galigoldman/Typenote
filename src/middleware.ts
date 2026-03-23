import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // /ingest/* is handled by next.config.ts rewrites — skip middleware entirely
  if (request.nextUrl.pathname.startsWith('/ingest')) {
    return;
  }

  return updateSession(request);
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
