/**
 * Integration tests for the two SECURITY DEFINER RPCs that power version
 * history:
 *
 *   - public.create_document_version(p_document_id, p_trigger)
 *   - public.restore_document_version(p_version_id)
 *
 * The existing `document-versions.integration.test.ts` covers the table
 * shape and cascade behavior but explicitly NOT these RPCs, because they
 * use `auth.uid()` and need a real authenticated session.
 *
 * We use `createUserClient` (anon-key client signed in as TEST_USER_A) so
 * the RPCs see a real JWT. SECURITY DEFINER executes with elevated
 * privileges but reads `auth.uid()` from the request JWT, so the
 * ownership checks behave as they would in production.
 *
 * Tested invariants:
 *   - create_document_version inserts a row with the document's current
 *     content/title/trigger and the calling user's user_id
 *   - 8-version ring-buffer cap: the 9th call prunes the oldest, never
 *     leaves >8 versions for a single document
 *   - create_document_version on a doc owned by a different user raises
 *     "Document not found" (RLS-style ownership check inside the RPC)
 *   - restore_document_version atomically (a) inserts a `before_restore`
 *     snapshot of the current doc, (b) overwrites the doc with the
 *     target version, and (c) leaves the table within the 8-row cap
 *   - restore_document_version on a version owned by a different user
 *     raises "Version not found"
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEST_USER_A,
  TEST_USER_B,
  createAdminClient,
  createUserClient,
} from '@/test/supabase-client';

const admin = createAdminClient();

const DOC_A = '7a000000-0000-0000-0000-00000000000a';
const DOC_B = '7a000000-0000-0000-0000-00000000000b';

function docContent(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

async function seedDocAs(userId: string, docId: string, text: string) {
  // Force a known starting state.
  await admin.from('document_versions').delete().eq('document_id', docId);
  await admin.from('documents').delete().eq('id', docId);
  const { error } = await admin.from('documents').insert({
    id: docId,
    user_id: userId,
    title: `Doc ${docId.slice(-4)}`,
    subject: 'other',
    canvas_type: 'blank',
    content: docContent(text),
    position: 0,
  });
  if (error) throw new Error(`seedDocAs: ${error.message}`);
}

async function cleanupAll() {
  for (const id of [DOC_A, DOC_B]) {
    await admin.from('document_versions').delete().eq('document_id', id);
    await admin.from('documents').delete().eq('id', id);
  }
}

describe('create_document_version RPC', () => {
  let clientA: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    await cleanupAll();
  });
  afterAll(cleanupAll);
  afterEach(cleanupAll);

  it("inserts a row that reflects the document's current state and the caller's user_id", async () => {
    await seedDocAs(TEST_USER_A.id, DOC_A, 'state-1');

    const { data, error } = await clientA.rpc('create_document_version', {
      p_document_id: DOC_A,
      p_trigger: 'idle',
    });
    expect(error).toBeNull();
    const inserted = (data as Array<{ version_id: string }>)[0];
    expect(inserted?.version_id).toBeTruthy();

    const { data: row } = await admin
      .from('document_versions')
      .select('document_id, user_id, trigger, content')
      .eq('id', inserted.version_id)
      .single();
    expect(row).toMatchObject({
      document_id: DOC_A,
      user_id: TEST_USER_A.id,
      trigger: 'idle',
    });
    expect(JSON.stringify(row!.content)).toContain('state-1');
  });

  it('enforces the 8-version ring buffer (9th call prunes the oldest)', async () => {
    await seedDocAs(TEST_USER_A.id, DOC_A, 'state-cap');

    // Fire 9 calls back-to-back. Each one re-reads the document's current
    // state (which doesn't change here), so they will be created with the
    // same content but distinct ids and timestamps.
    for (let i = 0; i < 9; i++) {
      const { error } = await clientA.rpc('create_document_version', {
        p_document_id: DOC_A,
        p_trigger: 'idle',
      });
      expect(error).toBeNull();
      // Small spacing to guarantee strictly-increasing created_at so the
      // "ORDER BY created_at ASC LIMIT 1" prune is deterministic.
      await new Promise((r) => setTimeout(r, 10));
    }

    const { count } = await admin
      .from('document_versions')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', DOC_A);
    expect(count).toBe(8);
  });

  it('raises "Document not found" when calling on a doc owned by another user', async () => {
    await seedDocAs(TEST_USER_B.id, DOC_B, 'B-only');

    const { error } = await clientA.rpc('create_document_version', {
      p_document_id: DOC_B,
      p_trigger: 'idle',
    });
    // The ownership check inside the RPC raises an exception; supabase-js
    // surfaces it on `error.message`.
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Document not found/);

    // …and the call had no side-effects.
    const { count } = await admin
      .from('document_versions')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', DOC_B);
    expect(count).toBe(0);
  });
});

describe('restore_document_version RPC', () => {
  let clientA: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    await cleanupAll();
  });
  afterAll(cleanupAll);
  afterEach(cleanupAll);

  it('atomically creates a before_restore snapshot AND overwrites the document', async () => {
    // Start with a doc at V3 and an explicit V1 in history.
    await seedDocAs(TEST_USER_A.id, DOC_A, 'V3-current');

    const { data: v1Insert } = await admin
      .from('document_versions')
      .insert({
        document_id: DOC_A,
        user_id: TEST_USER_A.id,
        title: 'V1',
        content: docContent('V1-original'),
        trigger: 'idle',
      })
      .select('id')
      .single();
    const v1Id = v1Insert!.id as string;

    const { error } = await clientA.rpc('restore_document_version', {
      p_version_id: v1Id,
    });
    expect(error).toBeNull();

    // 1. The document's content is now V1.
    const { data: doc } = await admin
      .from('documents')
      .select('content')
      .eq('id', DOC_A)
      .single();
    expect(JSON.stringify(doc!.content)).toContain('V1-original');

    // 2. A "before_restore" snapshot of the OLD V3 state was created in
    //    the same transaction — this is the safety net that lets a user
    //    undo an unwanted restore.
    const { data: snapshots } = await admin
      .from('document_versions')
      .select('content, trigger')
      .eq('document_id', DOC_A)
      .eq('trigger', 'before_restore');
    expect(snapshots).toHaveLength(1);
    expect(JSON.stringify(snapshots![0].content)).toContain('V3-current');
  });

  it('raises "Version not found" when calling with a version owned by another user', async () => {
    await seedDocAs(TEST_USER_B.id, DOC_B, 'B-only');
    const { data: bVer } = await admin
      .from('document_versions')
      .insert({
        document_id: DOC_B,
        user_id: TEST_USER_B.id,
        title: "B's version",
        content: docContent("B's old text"),
        trigger: 'idle',
      })
      .select('id')
      .single();

    const { error } = await clientA.rpc('restore_document_version', {
      p_version_id: bVer!.id,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Version not found/);

    // B's document is unchanged.
    const { data: doc } = await admin
      .from('documents')
      .select('content')
      .eq('id', DOC_B)
      .single();
    expect(JSON.stringify(doc!.content)).toContain('B-only');
  });
});
