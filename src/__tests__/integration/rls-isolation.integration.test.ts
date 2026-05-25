/**
 * RLS isolation tests — verify Supabase Row-Level Security actually prevents
 * one user from reading or modifying another user's data.
 *
 * Every other integration test in this repo runs as `service_role`, which
 * bypasses RLS by design. That makes those tests great for verifying schema /
 * cascade / trigger behaviour, but useless for verifying RLS policies — if a
 * policy were removed entirely, every existing test would still pass.
 *
 * This file uses two real anon-key clients, each signed in as a different
 * seeded user. Cross-user read attempts must return empty result sets;
 * cross-user write attempts must either fail or affect zero rows (verified
 * with the admin client). If any of these assertions fail, RLS has regressed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEST_USER_A,
  TEST_USER_B,
  createAdminClient,
  createUserClient,
} from '@/test/supabase-client';

const admin = createAdminClient();

// Stable fixture IDs in a high range so they don't collide with seeded data.
const FIXTURES = {
  a: {
    folderId: '7e000000-0000-0000-0000-00000000000a',
    docId: '7e000000-0000-0000-0000-00000000001a',
    courseId: '7e000000-0000-0000-0000-00000000002a',
    materialId: '7e000000-0000-0000-0000-00000000004a',
    conversationId: '7e000000-0000-0000-0000-00000000005a',
    messageId: '7e000000-0000-0000-0000-00000000006a',
    personalFileId: '7e000000-0000-0000-0000-00000000007a',
    versionId: '7e000000-0000-0000-0000-00000000008a',
  },
  b: {
    folderId: '7e000000-0000-0000-0000-00000000000b',
    docId: '7e000000-0000-0000-0000-00000000001b',
    courseId: '7e000000-0000-0000-0000-00000000002b',
    materialId: '7e000000-0000-0000-0000-00000000004b',
    conversationId: '7e000000-0000-0000-0000-00000000005b',
    messageId: '7e000000-0000-0000-0000-00000000006b',
    personalFileId: '7e000000-0000-0000-0000-00000000007b',
    versionId: '7e000000-0000-0000-0000-00000000008b',
  },
} as const;

describe('RLS isolation — cross-user access', () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    clientB = await createUserClient(TEST_USER_B);

    // Clean any leftover fixtures from a prior run.
    await cleanupFixtures();

    // Seed parallel fixtures, owned by each user respectively.
    await seedFor(TEST_USER_A.id, FIXTURES.a);
    await seedFor(TEST_USER_B.id, FIXTURES.b);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  // ─── documents ─────────────────────────────────────────────────────────

  it('User A cannot read User B documents', async () => {
    const { data, error } = await clientA
      .from('documents')
      .select()
      .eq('id', FIXTURES.b.docId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('User A cannot update User B documents', async () => {
    await clientA
      .from('documents')
      .update({ title: 'hacked-by-a' })
      .eq('id', FIXTURES.b.docId);

    const { data } = await admin
      .from('documents')
      .select('title')
      .eq('id', FIXTURES.b.docId)
      .single();
    expect(data?.title).toBe(`B doc ${FIXTURES.b.docId}`);
  });

  it('User A cannot delete User B documents', async () => {
    await clientA.from('documents').delete().eq('id', FIXTURES.b.docId);
    const { data } = await admin
      .from('documents')
      .select('id')
      .eq('id', FIXTURES.b.docId);
    expect(data ?? []).toHaveLength(1);
  });

  it('User A cannot insert a document claiming User B ownership', async () => {
    const { error } = await clientA.from('documents').insert({
      id: '7e000000-0000-0000-0000-0000000000ff',
      user_id: TEST_USER_B.id,
      title: 'spoofed-by-a',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });
    // RLS WITH CHECK should reject this. Either an error is raised or the
    // row never lands — verify the latter explicitly.
    const { data } = await admin
      .from('documents')
      .select('id')
      .eq('id', '7e000000-0000-0000-0000-0000000000ff');
    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });

  // ─── folders ───────────────────────────────────────────────────────────

  it('User A cannot read User B folders', async () => {
    const { data } = await clientA
      .from('folders')
      .select()
      .eq('id', FIXTURES.b.folderId);
    expect(data ?? []).toHaveLength(0);
  });

  // ─── courses + nested resources ────────────────────────────────────────

  it('User A cannot read User B courses', async () => {
    const { data } = await clientA
      .from('courses')
      .select()
      .eq('id', FIXTURES.b.courseId);
    expect(data ?? []).toHaveLength(0);
  });

  it('User A cannot read User B course_materials', async () => {
    const { data } = await clientA
      .from('course_materials')
      .select()
      .eq('id', FIXTURES.b.materialId);
    expect(data ?? []).toHaveLength(0);
  });

  // ─── personal_files ────────────────────────────────────────────────────

  it('User A cannot read User B personal_files', async () => {
    const { data } = await clientA
      .from('personal_files')
      .select()
      .eq('id', FIXTURES.b.personalFileId);
    expect(data ?? []).toHaveLength(0);
  });

  // ─── ai_conversations + ai_messages ────────────────────────────────────

  it('User A cannot read User B ai_conversations', async () => {
    const { data } = await clientA
      .from('ai_conversations')
      .select()
      .eq('id', FIXTURES.b.conversationId);
    expect(data ?? []).toHaveLength(0);
  });

  it('User A cannot read User B ai_messages', async () => {
    const { data } = await clientA
      .from('ai_messages')
      .select()
      .eq('id', FIXTURES.b.messageId);
    expect(data ?? []).toHaveLength(0);
  });

  // ─── document_versions ─────────────────────────────────────────────────

  it('User A cannot read User B document_versions', async () => {
    const { data } = await clientA
      .from('document_versions')
      .select()
      .eq('id', FIXTURES.b.versionId);
    expect(data ?? []).toHaveLength(0);
  });

  // ─── sanity: each client CAN see their own data ────────────────────────

  it('each user CAN read their own document', async () => {
    const { data: dataA } = await clientA
      .from('documents')
      .select()
      .eq('id', FIXTURES.a.docId);
    expect(dataA).toHaveLength(1);

    const { data: dataB } = await clientB
      .from('documents')
      .select()
      .eq('id', FIXTURES.b.docId);
    expect(dataB).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fixture management — uses admin client to set up rows for both users.
// ─────────────────────────────────────────────────────────────────────────

type Fixtures = (typeof FIXTURES)['a'];

async function seedFor(userId: string, ids: Fixtures): Promise<void> {
  await admin.from('folders').insert({
    id: ids.folderId,
    user_id: userId,
    name: `Folder ${ids.folderId}`,
    color: '#000000',
    position: 0,
  });

  await admin.from('documents').insert({
    id: ids.docId,
    user_id: userId,
    folder_id: ids.folderId,
    title: `B doc ${ids.docId}`.replace(
      'B doc',
      userId === TEST_USER_A.id ? 'A doc' : 'B doc',
    ),
    subject: 'other',
    canvas_type: 'blank',
    position: 0,
  });

  await admin.from('courses').insert({
    id: ids.courseId,
    user_id: userId,
    name: `Course ${ids.courseId}`,
    code: 'RLS-TEST',
    semester: 'Spring 2026',
    color: '#000000',
    position: 0,
  });

  await admin.from('course_materials').insert({
    id: ids.materialId,
    course_id: ids.courseId,
    user_id: userId,
    category: 'material',
    storage_path: `${userId}/rls-test.pdf`,
    file_name: 'rls-test.pdf',
    label: 'RLS Test',
    file_size: 1024,
    mime_type: 'application/pdf',
  });

  await admin.from('personal_files').insert({
    id: ids.personalFileId,
    user_id: userId,
    storage_path: `${userId}/personal.pdf`,
    file_name: 'personal.pdf',
    file_size: 1024,
    mime_type: 'application/pdf',
  });

  await admin.from('ai_conversations').insert({
    id: ids.conversationId,
    user_id: userId,
    course_id: ids.courseId,
    title: 'RLS test conversation',
  });

  await admin.from('ai_messages').insert({
    id: ids.messageId,
    conversation_id: ids.conversationId,
    role: 'user',
    content: 'rls-test',
  });

  await admin.from('document_versions').insert({
    id: ids.versionId,
    document_id: ids.docId,
    user_id: userId,
    content: { type: 'doc', content: [] },
    pages: null,
    label: null,
    trigger: 'idle',
  });
}

async function cleanupFixtures(): Promise<void> {
  const ids = [
    ...Object.values(FIXTURES.a),
    ...Object.values(FIXTURES.b),
    '7e000000-0000-0000-0000-0000000000ff',
  ];
  // Order matters for FK relationships — delete leaves before roots.
  await admin.from('document_versions').delete().in('id', ids);
  await admin.from('ai_messages').delete().in('id', ids);
  await admin.from('ai_conversations').delete().in('id', ids);
  await admin.from('personal_files').delete().in('id', ids);
  await admin.from('course_materials').delete().in('id', ids);
  await admin.from('documents').delete().in('id', ids);
  await admin.from('courses').delete().in('id', ids);
  await admin.from('folders').delete().in('id', ids);
}
