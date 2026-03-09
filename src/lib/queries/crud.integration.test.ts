/**
 * Integration test: verifies CRUD operations work against the real
 * database and that RLS policies enforce user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAuthenticatedClient,
  createAdminClient,
  TEST_USER_ID,
} from '@/test/supabase-client';

let supabase: SupabaseClient;
let admin: SupabaseClient;

// Track created IDs for cleanup
const createdIds: { table: string; id: string }[] = [];

beforeAll(async () => {
  supabase = await createAuthenticatedClient();
  admin = createAdminClient();
});

afterAll(async () => {
  // Clean up in reverse order (respect foreign keys)
  for (const { table, id } of createdIds.reverse()) {
    await admin.from(table).delete().eq('id', id);
  }
});

describe('Folders CRUD', () => {
  let folderId: string;

  it('can create a folder', async () => {
    const { data, error } = await supabase
      .from('folders')
      .insert({
        user_id: TEST_USER_ID,
        name: 'Test Folder',
        color: '#FF0000',
        position: 99,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      name: 'Test Folder',
      color: '#FF0000',
      user_id: TEST_USER_ID,
    });

    folderId = data!.id;
    createdIds.push({ table: 'folders', id: folderId });
  });

  it('can read the created folder', async () => {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();

    expect(error).toBeNull();
    expect(data!.name).toBe('Test Folder');
  });

  it('can update a folder', async () => {
    const { data, error } = await supabase
      .from('folders')
      .update({ name: 'Updated Folder' })
      .eq('id', folderId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.name).toBe('Updated Folder');
  });

  it('updated_at trigger fires on update', async () => {
    const { data: before } = await supabase
      .from('folders')
      .select('updated_at')
      .eq('id', folderId)
      .single();

    // Small delay so timestamp differs
    await new Promise((r) => setTimeout(r, 50));

    await supabase
      .from('folders')
      .update({ name: 'Trigger Test' })
      .eq('id', folderId);

    const { data: after } = await supabase
      .from('folders')
      .select('updated_at')
      .eq('id', folderId)
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );
  });
});

describe('Documents CRUD', () => {
  let docId: string;

  it('can create a document', async () => {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: TEST_USER_ID,
        title: 'Integration Test Doc',
        subject: 'other',
        canvas_type: 'blank',
        content: { type: 'doc', content: [] },
        position: 99,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.title).toBe('Integration Test Doc');

    docId = data!.id;
    createdIds.push({ table: 'documents', id: docId });
  });

  it('can update document content (JSONB)', async () => {
    const newContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ],
    };

    const { data, error } = await supabase
      .from('documents')
      .update({ content: newContent })
      .eq('id', docId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.content).toEqual(newContent);
  });

  it('can delete a document', async () => {
    const { error } = await supabase.from('documents').delete().eq('id', docId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from('documents')
      .select('id')
      .eq('id', docId)
      .single();

    expect(data).toBeNull();

    // Remove from cleanup since we deleted it manually
    const idx = createdIds.findIndex(
      (r) => r.table === 'documents' && r.id === docId,
    );
    if (idx !== -1) createdIds.splice(idx, 1);
  });
});

describe('RLS policies', () => {
  it('authenticated user cannot see other users data', async () => {
    // Insert a row as admin for a different user_id
    const fakeUserId = '00000000-0000-0000-0000-000000000099';

    // Create a fake user first (needed for FK to profiles)
    await admin.from('profiles').upsert({
      id: fakeUserId,
      email: 'fake@test.dev',
    });

    const { data: inserted } = await admin
      .from('folders')
      .insert({
        user_id: fakeUserId,
        name: 'Other User Folder',
        color: '#000000',
        position: 0,
      })
      .select()
      .single();

    if (inserted) {
      createdIds.push({ table: 'folders', id: inserted.id });

      // Authenticated user should NOT see this folder
      const { data } = await supabase
        .from('folders')
        .select('*')
        .eq('id', inserted.id)
        .single();

      expect(data).toBeNull();

      // Clean up the fake profile
      createdIds.push({ table: 'profiles', id: fakeUserId });
    }
  });
});
