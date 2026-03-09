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
