import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the service_role key.
 * Used ONLY in API routes for writing to shared Moodle tables.
 * NEVER expose this to the client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
