/**
 * Integration tests for document_versions table and version history logic.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * Tests table operations, cap enforcement, cascade delete, and restore flow.
 *
 * Note: The create_document_version and restore_document_version RPCs use
 * auth.uid() which requires a real auth session. Here we test the underlying
 * table behavior directly — the RPCs are thin wrappers around these operations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

const TEST_DOC_ID = '20000000-0000-0000-0000-000000000001'; // seeded "Limits and Continuity"

let supabase: SupabaseClient;

beforeAll(async () => {
  supabase = createAdminClient();

  // Clean up any test versions (keep seeded ones by deleting only non-seeded)
  await supabase
    .from('document_versions')
    .delete()
    .eq('document_id', TEST_DOC_ID)
    .not(
      'id',
      'in',
      '("90000000-0000-0000-0000-000000000001","90000000-0000-0000-0000-000000000002","90000000-0000-0000-0000-000000000003")',
    );
});

afterAll(async () => {
  // Clean up versions created during tests (keep seeded ones)
  await supabase
    .from('document_versions')
    .delete()
    .eq('document_id', TEST_DOC_ID)
    .not(
      'id',
      'in',
      '("90000000-0000-0000-0000-000000000001","90000000-0000-0000-0000-000000000002","90000000-0000-0000-0000-000000000003")',
    );
});

describe('document_versions table', () => {
  it('has seeded version records for the test document', async () => {
    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_id', TEST_DOC_ID)
      .order('created_at', { ascending: false });

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data![0].trigger).toBe('close');
    expect(data![1].trigger).toBe('periodic');
    expect(data![2].trigger).toBe('idle');
  });

  it('can insert a new version with correct fields', async () => {
    const { data, error } = await supabase
      .from('document_versions')
      .insert({
        document_id: TEST_DOC_ID,
        user_id: TEST_USER_ID,
        content: { type: 'doc', content: [] },
        pages: null,
        title: 'Test Version',
        trigger: 'idle',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      document_id: TEST_DOC_ID,
      user_id: TEST_USER_ID,
      title: 'Test Version',
      trigger: 'idle',
    });
    expect(data!.id).toBeTruthy();
    expect(data!.created_at).toBeTruthy();

    // Clean up
    await supabase.from('document_versions').delete().eq('id', data!.id);
  });

  it('stores pages JSONB when provided', async () => {
    const pages = {
      pages: [
        { id: 'p1', order: 0, strokes: [], textBoxes: [], flowContent: null },
      ],
    };

    const { data, error } = await supabase
      .from('document_versions')
      .insert({
        document_id: TEST_DOC_ID,
        user_id: TEST_USER_ID,
        content: { type: 'doc', content: [] },
        pages,
        title: 'With Pages',
        trigger: 'periodic',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.pages).toEqual(pages);

    // Clean up
    await supabase.from('document_versions').delete().eq('id', data!.id);
  });

  it('orders by created_at DESC when queried', async () => {
    const { data, error } = await supabase
      .from('document_versions')
      .select('created_at')
      .eq('document_id', TEST_DOC_ID)
      .order('created_at', { ascending: false });

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);

    // Verify descending order
    for (let i = 1; i < data!.length; i++) {
      expect(
        new Date(data![i - 1].created_at).getTime(),
      ).toBeGreaterThanOrEqual(new Date(data![i].created_at).getTime());
    }
  });
});

describe('cap enforcement (max 8 versions)', () => {
  it('allows up to 8 versions per document', async () => {
    // We already have 3 seeded versions. Insert 5 more to reach 8.
    const inserts = Array.from({ length: 5 }, (_, i) => ({
      document_id: TEST_DOC_ID,
      user_id: TEST_USER_ID,
      content: { type: 'doc', content: [{ type: 'paragraph', text: `v${i}` }] },
      pages: null,
      title: `Cap Test ${i}`,
      trigger: 'idle' as const,
    }));

    const { error: insertError } = await supabase
      .from('document_versions')
      .insert(inserts);

    expect(insertError).toBeNull();

    const { data, error } = await supabase
      .from('document_versions')
      .select('id')
      .eq('document_id', TEST_DOC_ID);

    expect(error).toBeNull();
    expect(data).toHaveLength(8);

    // Clean up the 5 we just inserted (keep seeded)
    await supabase
      .from('document_versions')
      .delete()
      .eq('document_id', TEST_DOC_ID)
      .not(
        'id',
        'in',
        '("90000000-0000-0000-0000-000000000001","90000000-0000-0000-0000-000000000002","90000000-0000-0000-0000-000000000003")',
      );
  });
});

describe('cascade delete', () => {
  it('deletes versions when the parent document is deleted', async () => {
    // Create a temporary document
    const { data: doc } = await supabase
      .from('documents')
      .insert({
        user_id: TEST_USER_ID,
        title: 'Temp Doc for Cascade Test',
        content: {},
        subject: 'other',
        canvas_type: 'blank',
        position: 99,
      })
      .select('id')
      .single();

    expect(doc).toBeTruthy();

    // Insert a version for this document
    const { data: version } = await supabase
      .from('document_versions')
      .insert({
        document_id: doc!.id,
        user_id: TEST_USER_ID,
        content: { type: 'doc', content: [] },
        title: 'Cascade Test Version',
        trigger: 'idle',
      })
      .select('id')
      .single();

    expect(version).toBeTruthy();

    // Delete the document
    await supabase.from('documents').delete().eq('id', doc!.id);

    // Verify the version is also deleted
    const { data: orphanedVersions } = await supabase
      .from('document_versions')
      .select('id')
      .eq('id', version!.id);

    expect(orphanedVersions).toHaveLength(0);
  });
});

describe('restore flow (table-level)', () => {
  it('can overwrite document content from a version snapshot', async () => {
    // Read the current document content
    const { data: docBefore } = await supabase
      .from('documents')
      .select('content, title')
      .eq('id', TEST_DOC_ID)
      .single();

    expect(docBefore).toBeTruthy();

    // Read the oldest version (has simpler content)
    const { data: version } = await supabase
      .from('document_versions')
      .select('content, pages, title')
      .eq('id', '90000000-0000-0000-0000-000000000001')
      .single();

    expect(version).toBeTruthy();

    // Simulate "before_restore" snapshot: insert current state
    const { data: beforeRestore, error: snapshotError } = await supabase
      .from('document_versions')
      .insert({
        document_id: TEST_DOC_ID,
        user_id: TEST_USER_ID,
        content: docBefore!.content,
        pages: null,
        title: docBefore!.title,
        trigger: 'before_restore',
      })
      .select()
      .single();

    expect(snapshotError).toBeNull();
    expect(beforeRestore!.trigger).toBe('before_restore');

    // Overwrite document with version content
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        content: version!.content,
        pages: version!.pages,
      })
      .eq('id', TEST_DOC_ID);

    expect(updateError).toBeNull();

    // Verify the document now has the version's content
    const { data: docAfter } = await supabase
      .from('documents')
      .select('content')
      .eq('id', TEST_DOC_ID)
      .single();

    expect(docAfter!.content).toEqual(version!.content);

    // Restore the original content back (cleanup)
    await supabase
      .from('documents')
      .update({ content: docBefore!.content })
      .eq('id', TEST_DOC_ID);

    // Clean up the before_restore snapshot
    await supabase
      .from('document_versions')
      .delete()
      .eq('id', beforeRestore!.id);
  });
});
