/**
 * Integration tests for folder behavior the `folders.ts` server actions rely on.
 *
 * The server actions themselves are thin wrappers over Supabase CRUD — the
 * interesting and risky behavior lives in the schema:
 *
 *   - `folders.parent_id` references `folders(id) ON DELETE CASCADE`. Deleting
 *     a parent folder must remove the subtree.
 *   - `documents.folder_id` references `folders(id) ON DELETE SET NULL`.
 *     Deleting a folder must NOT delete the documents in it; it must leave them
 *     in "root" (folder_id = null).
 *   - RLS update/delete by a non-owner must affect zero rows. The
 *     `rls-isolation` integration test only verifies SELECT — it does not
 *     verify the WITH-CHECK USING clause on UPDATE/DELETE.
 *   - The `updated_at` trigger must fire on UPDATE.
 *
 * Tests run against the real local Supabase via admin (service_role) and
 * anon-key user clients, mirroring `documents.integration.test.ts` and
 * `rls-isolation.integration.test.ts`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEST_USER_A,
  TEST_USER_B,
  TEST_USER_ID,
  createAdminClient,
  createUserClient,
} from '@/test/supabase-client';

const admin = createAdminClient();

// High-range UUIDs so they don't collide with seeded folders or other tests.
const ROOT_ID = '7d000000-0000-0000-0000-000000000001';
const CHILD_ID = '7d000000-0000-0000-0000-000000000002';
const GRANDCHILD_ID = '7d000000-0000-0000-0000-000000000003';
const DOC_IN_FOLDER_ID = '7d000000-0000-0000-0000-000000000010';
const USER_B_FOLDER_ID = '7d000000-0000-0000-0000-0000000000b1';

const allTestIds = [
  ROOT_ID,
  CHILD_ID,
  GRANDCHILD_ID,
  DOC_IN_FOLDER_ID,
  USER_B_FOLDER_ID,
];

async function cleanupAll(): Promise<void> {
  // Documents reference folders ON DELETE SET NULL — they survive folder
  // deletion, so delete docs explicitly.
  await admin.from('documents').delete().in('id', allTestIds);
  await admin.from('folders').delete().in('id', allTestIds);
}

describe('folders — schema behavior backing folders.ts server actions', () => {
  beforeAll(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  afterEach(async () => {
    await cleanupAll();
  });

  it('createFolder: round-trip insert succeeds and round-trips name/color/parent_id', async () => {
    const { error } = await admin.from('folders').insert({
      id: ROOT_ID,
      user_id: TEST_USER_ID,
      name: 'Calculus',
      color: '#FF0000',
      parent_id: null,
      position: 0,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('folders')
      .select('*')
      .eq('id', ROOT_ID)
      .single();
    expect(data).toMatchObject({
      name: 'Calculus',
      color: '#FF0000',
      parent_id: null,
      user_id: TEST_USER_ID,
    });
  });

  it('updateFolder: updated_at trigger fires when name/color change', async () => {
    await admin.from('folders').insert({
      id: ROOT_ID,
      user_id: TEST_USER_ID,
      name: 'Old name',
      color: '#000000',
      position: 0,
    });

    const { data: before } = await admin
      .from('folders')
      .select('updated_at')
      .eq('id', ROOT_ID)
      .single();
    const originalUpdatedAt = before!.updated_at as string;

    // Sleep so the trigger writes a strictly-later timestamp. Postgres
    // `now()` has microsecond precision, but two updates in the same
    // statement-time can tie — a small delay is the simplest way to ensure
    // the trigger fired AND committed a new value.
    await new Promise((r) => setTimeout(r, 50));

    const { error } = await admin
      .from('folders')
      .update({ name: 'New name', color: '#00FF00' })
      .eq('id', ROOT_ID);
    expect(error).toBeNull();

    const { data: after } = await admin
      .from('folders')
      .select('name, color, updated_at')
      .eq('id', ROOT_ID)
      .single();
    expect(after!.name).toBe('New name');
    expect(after!.color).toBe('#00FF00');
    expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it('deleteFolder: removes the folder row', async () => {
    await admin.from('folders').insert({
      id: ROOT_ID,
      user_id: TEST_USER_ID,
      name: 'Doomed',
      color: '#000000',
      position: 0,
    });

    await admin.from('folders').delete().eq('id', ROOT_ID);

    const { data } = await admin.from('folders').select('id').eq('id', ROOT_ID);
    expect(data ?? []).toHaveLength(0);
  });

  it('deleting a parent folder cascades to its descendants (parent_id ON DELETE CASCADE)', async () => {
    // root -> child -> grandchild
    await admin.from('folders').insert([
      {
        id: ROOT_ID,
        user_id: TEST_USER_ID,
        name: 'Root',
        color: '#000000',
        parent_id: null,
        position: 0,
      },
      {
        id: CHILD_ID,
        user_id: TEST_USER_ID,
        name: 'Child',
        color: '#000000',
        parent_id: ROOT_ID,
        position: 0,
      },
      {
        id: GRANDCHILD_ID,
        user_id: TEST_USER_ID,
        name: 'Grandchild',
        color: '#000000',
        parent_id: CHILD_ID,
        position: 0,
      },
    ]);

    await admin.from('folders').delete().eq('id', ROOT_ID);

    const { data } = await admin
      .from('folders')
      .select('id')
      .in('id', [ROOT_ID, CHILD_ID, GRANDCHILD_ID]);
    expect(data ?? []).toHaveLength(0);
  });

  it('deleting a folder leaves its documents intact with folder_id = null (ON DELETE SET NULL)', async () => {
    await admin.from('folders').insert({
      id: ROOT_ID,
      user_id: TEST_USER_ID,
      name: 'Folder with docs',
      color: '#000000',
      position: 0,
    });

    await admin.from('documents').insert({
      id: DOC_IN_FOLDER_ID,
      user_id: TEST_USER_ID,
      folder_id: ROOT_ID,
      title: 'Doc that survives folder deletion',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    await admin.from('folders').delete().eq('id', ROOT_ID);

    const { data: doc } = await admin
      .from('documents')
      .select('id, folder_id')
      .eq('id', DOC_IN_FOLDER_ID)
      .single();
    // Document MUST still exist…
    expect(doc).not.toBeNull();
    // …and have been moved to root (folder_id NULL).
    expect(doc!.folder_id).toBeNull();
  });
});

describe('folders — RLS update/delete enforcement', () => {
  let clientA: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    await admin.from('folders').delete().eq('id', USER_B_FOLDER_ID);

    await admin.from('folders').insert({
      id: USER_B_FOLDER_ID,
      user_id: TEST_USER_B.id,
      name: "B's private folder",
      color: '#0000FF',
      position: 0,
    });
  });

  afterAll(async () => {
    await admin.from('folders').delete().eq('id', USER_B_FOLDER_ID);
  });

  it("User A's UPDATE on User B's folder affects zero rows (RLS USING clause)", async () => {
    await clientA
      .from('folders')
      .update({ name: 'hacked-by-a' })
      .eq('id', USER_B_FOLDER_ID);

    const { data } = await admin
      .from('folders')
      .select('name')
      .eq('id', USER_B_FOLDER_ID)
      .single();
    expect(data!.name).toBe("B's private folder");
  });

  it("User A's DELETE on User B's folder affects zero rows (RLS USING clause)", async () => {
    await clientA.from('folders').delete().eq('id', USER_B_FOLDER_ID);

    const { data } = await admin
      .from('folders')
      .select('id')
      .eq('id', USER_B_FOLDER_ID);
    expect(data ?? []).toHaveLength(1);
  });
});
