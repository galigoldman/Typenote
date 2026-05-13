/**
 * Integration test: verifies CRUD operations and triggers work
 * against the real database.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * This tests the database layer itself — migrations, triggers,
 * constraints, and JSONB storage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

// Track created IDs for cleanup
const createdIds: { table: string; id: string }[] = [];

beforeAll(() => {
  supabase = createAdminClient();
});

afterAll(async () => {
  // Clean up in reverse order (respect foreign keys)
  for (const { table, id } of createdIds.reverse()) {
    await supabase.from(table).delete().eq('id', id);
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

// Cross-user RLS isolation is tested in
// src/__tests__/integration/rls-isolation.integration.test.ts. The previous
// placeholder test here used the admin client, which bypasses RLS, and so
// could not detect a regression in any policy.
