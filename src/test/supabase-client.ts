/**
 * Supabase test client for integration tests.
 *
 * Uses the service_role key to bypass RLS, and the anon key + auth
 * to test as an authenticated user (respecting RLS policies).
 *
 * Environment variables (set in CI or .env.local):
 *   SUPABASE_URL              - local Supabase API URL
 *   SUPABASE_ANON_KEY         - anon key (RLS-enforced)
 *   SUPABASE_SERVICE_ROLE_KEY - service_role key (bypasses RLS)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Test user credentials (matches seed.sql)
const TEST_USER_EMAIL = 'test@typenote.dev';
const TEST_USER_PASSWORD = 'Test1234';

/**
 * Admin client that bypasses RLS. Use for setup/teardown only.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Authenticated client that respects RLS as the test user.
 * Signs in with the seeded test user credentials.
 */
export async function createAuthenticatedClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (error) {
    throw new Error(
      `Failed to sign in test user: ${error.message}. ` +
        'Is Supabase running? Did seed.sql load?',
    );
  }

  return client;
}

/** The user_id of the seeded test user (from seed.sql) */
export const TEST_USER_ID = 'ac3be77d-4566-406c-9ac0-7c410634ad41';
