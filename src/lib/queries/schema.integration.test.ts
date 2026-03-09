/**
 * Integration test: verifies that migrations apply correctly and
 * seed data loads into the expected tables.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * These tests catch migration regressions — if a migration breaks,
 * these fail.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/test/supabase-client';

let supabase: SupabaseClient;

beforeAll(() => {
  supabase = createAdminClient();
});

describe('Schema & seed data', () => {
  it('profiles table exists and has the seeded test user', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', 'test@typenote.dev')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      email: 'test@typenote.dev',
    });
  });

  it('folders table exists and has seeded folders', async () => {
    const { data, error } = await supabase
      .from('folders')
      .select('id, name')
      .order('position');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(4);
    expect(data!.map((f) => f.name)).toContain('Calculus I');
  });

  it('documents table exists and has seeded documents', async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title')
      .order('position');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(6);
    expect(data!.map((d) => d.title)).toContain('Limits and Continuity');
  });

  it('courses table exists and has seeded courses', async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, code')
      .order('position');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
    expect(data!.map((c) => c.code)).toContain('CS101');
  });

  it('course_weeks table exists and has seeded weeks', async () => {
    const { data, error } = await supabase
      .from('course_weeks')
      .select('id, topic, week_number')
      .order('week_number');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);
  });

  it('course_materials table exists and has seeded materials', async () => {
    const { data, error } = await supabase
      .from('course_materials')
      .select('id, file_name, category')
      .order('created_at');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);
  });
});
