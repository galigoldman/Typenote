import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-only authorization gate for the /admin area.
 *
 * Authentication is handled upstream by middleware (an unauthenticated /admin
 * hit is redirected to /login before any layout runs). This enforces
 * AUTHORIZATION: only an is_admin profile may proceed. Non-admins get a 404 so
 * the admin area is not discoverable. Returns the admin user id.
 */
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    notFound();
  }

  return user.id;
}
