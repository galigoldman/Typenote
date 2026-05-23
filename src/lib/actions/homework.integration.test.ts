/**
 * Integration tests for homework session CRUD and RLS.
 *
 * Uses the admin client (service-role) for direct DB operations
 * and the user client (anon + JWT) for RLS verification.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Seed data IDs
const COURSE_ID = '30000000-0000-0000-0000-000000000001'; // CS101
const EXERCISE_DOC_ID = '20000000-0000-0000-0000-000000000010';
const HW_DOC_ID = '20000000-0000-0000-0000-000000000011';
const HW_SESSION_ID = 'a0000000-0000-0000-0000-000000000001';
const MATERIAL_ID = '50000000-0000-0000-0000-000000000001';

let admin: SupabaseClient;
const createdDocIds: string[] = [];
const createdSessionIds: string[] = [];

beforeAll(() => {
  admin = createAdminClient();
});

afterAll(async () => {
  // Clean up sessions first (FK), then docs
  for (const id of createdSessionIds) {
    await admin.from('homework_sessions').delete().eq('id', id);
  }
  for (const id of createdDocIds) {
    await admin.from('documents').delete().eq('id', id);
  }
});

// ---------------------------------------------------------------------------
// Seeded data verification
// ---------------------------------------------------------------------------

describe('homework_sessions seed data', () => {
  it('should have the seeded homework session', async () => {
    const { data, error } = await admin
      .from('homework_sessions')
      .select('*')
      .eq('id', HW_SESSION_ID)
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.document_id).toBe(HW_DOC_ID);
    expect(data!.exercise_document_id).toBe(EXERCISE_DOC_ID);
    expect(data!.course_id).toBe(COURSE_ID);
    expect(data!.user_id).toBe(TEST_USER_A.id);
  });

  it('should have the seeded session material', async () => {
    const { data, error } = await admin
      .from('homework_session_materials')
      .select('*')
      .eq('session_id', HW_SESSION_ID);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].material_type).toBe('course_material');
    expect(data![0].material_id).toBe(MATERIAL_ID);
  });
});

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

describe('homework session CRUD', () => {
  it('should create a homework session with materials', async () => {
    // Create a new doc for the exercise
    const { data: doc } = await admin
      .from('documents')
      .insert({
        user_id: TEST_USER_A.id,
        course_id: COURSE_ID,
        title: 'Test HW Doc',
        content: {},
        subject: 'other',
        canvas_type: 'blank',
        position: 99,
      })
      .select('id')
      .single();
    createdDocIds.push(doc!.id);

    // Create session
    const { data: session, error } = await admin
      .from('homework_sessions')
      .insert({
        document_id: doc!.id,
        exercise_document_id: EXERCISE_DOC_ID,
        course_id: COURSE_ID,
        user_id: TEST_USER_A.id,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(session).toBeTruthy();
    createdSessionIds.push(session!.id);

    // Add material link
    const { error: matErr } = await admin
      .from('homework_session_materials')
      .insert({
        session_id: session!.id,
        material_type: 'course_material',
        material_id: MATERIAL_ID,
      });
    expect(matErr).toBeNull();
  });

  it('should enforce UNIQUE on document_id', async () => {
    // Try to create a second session for the seeded HW doc
    const { error } = await admin.from('homework_sessions').insert({
      document_id: HW_DOC_ID,
      exercise_document_id: EXERCISE_DOC_ID,
      course_id: COURSE_ID,
      user_id: TEST_USER_A.id,
    });

    expect(error).toBeTruthy();
    expect(error!.code).toBe('23505'); // unique violation
  });

  it('should enforce UNIQUE on (session_id, material_type, material_id)', async () => {
    // Try to add duplicate material to seeded session
    const { error } = await admin
      .from('homework_session_materials')
      .insert({
        session_id: HW_SESSION_ID,
        material_type: 'course_material',
        material_id: MATERIAL_ID,
      });

    expect(error).toBeTruthy();
    expect(error!.code).toBe('23505');
  });

  it('should cascade delete session when document is deleted', async () => {
    // Create a throwaway doc + session
    const { data: doc } = await admin
      .from('documents')
      .insert({
        user_id: TEST_USER_A.id,
        course_id: COURSE_ID,
        title: 'Cascade Test',
        content: {},
        subject: 'other',
        canvas_type: 'blank',
        position: 98,
      })
      .select('id')
      .single();

    const { data: session } = await admin
      .from('homework_sessions')
      .insert({
        document_id: doc!.id,
        exercise_document_id: EXERCISE_DOC_ID,
        course_id: COURSE_ID,
        user_id: TEST_USER_A.id,
      })
      .select('id')
      .single();

    // Delete the document
    await admin.from('documents').delete().eq('id', doc!.id);

    // Session should be gone
    const { data: gone } = await admin
      .from('homework_sessions')
      .select('id')
      .eq('id', session!.id)
      .single();
    expect(gone).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RLS isolation
// ---------------------------------------------------------------------------

describe('homework session RLS', () => {
  it('user A can read their own sessions', async () => {
    const clientA = await createUserClient(TEST_USER_A);
    const { data, error } = await clientA
      .from('homework_sessions')
      .select('*')
      .eq('id', HW_SESSION_ID)
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.user_id).toBe(TEST_USER_A.id);
  });

  it('user B cannot read user A sessions', async () => {
    const clientB = await createUserClient(TEST_USER_B);
    const { data } = await clientB
      .from('homework_sessions')
      .select('*')
      .eq('id', HW_SESSION_ID)
      .single();

    expect(data).toBeNull();
  });

  it('user A can read their own session materials', async () => {
    const clientA = await createUserClient(TEST_USER_A);
    const { data, error } = await clientA
      .from('homework_session_materials')
      .select('*')
      .eq('session_id', HW_SESSION_ID);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('user B cannot read user A session materials', async () => {
    const clientB = await createUserClient(TEST_USER_B);
    const { data } = await clientB
      .from('homework_session_materials')
      .select('*')
      .eq('session_id', HW_SESSION_ID);

    expect(data).toHaveLength(0);
  });
});
