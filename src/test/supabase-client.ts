/**
 * Supabase test client for integration tests.
 *
 * Uses the service_role key which bypasses RLS — suitable for
 * verifying that migrations, seed data, and CRUD operations work.
 *
 * RLS policy correctness is tested separately via direct SQL that
 * switches the Postgres role, avoiding dependency on GoTrue.
 *
 * Environment variables (set in CI or .env.local):
 *   SUPABASE_URL              - local Supabase API URL
 *   SUPABASE_SERVICE_ROLE_KEY - service_role key (bypasses RLS)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Admin client that bypasses RLS. Used for all integration tests.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Direct Postgres connection URL for RLS testing */
export const DATABASE_URL = DB_URL;

/** The user_id of the seeded test user (from seed.sql) */
export const TEST_USER_ID = 'ac3be77d-4566-406c-9ac0-7c410634ad41';

/** Seeded test user A — used as the "default" user across integration tests. */
export const TEST_USER_A = {
  id: 'ac3be77d-4566-406c-9ac0-7c410634ad41',
  email: 'test@typenote.dev',
  password: 'Test1234',
} as const;

/** Seeded test user B — used for cross-user (RLS isolation) testing. */
export const TEST_USER_B = {
  id: 'bd4ce88e-5677-507d-ad1d-8d4275a45b52',
  email: 'test-b@typenote.dev',
  password: 'Test1234',
} as const;

/** Supabase anon key (local dev). CI overrides via env. */
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/**
 * Build an anon-key client and sign it in as the given seeded user.
 * All requests this client makes will carry the user's JWT, so RLS applies
 * exactly as it would for that user in the real app. Use this — not the
 * admin client — to test RLS policies.
 */
export async function createUserClient(user: {
  email: string;
  password: string;
}): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(
      `Failed to sign in ${user.email}: ${error.message}. Did you re-run supabase/seed.sql after adding test-b?`,
    );
  }
  return client;
}
