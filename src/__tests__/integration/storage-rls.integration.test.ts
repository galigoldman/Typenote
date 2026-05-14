/**
 * Storage-bucket RLS isolation tests.
 *
 * The `personal-files` and `course-materials` buckets are PRIVATE
 * (`public: false`) and guard cross-user access via path-prefix RLS:
 *
 *   USING (
 *     bucket_id = 'personal-files'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   )
 *
 * In plain English: a file at `{user_id}/anything.pdf` is only
 * readable/writable by the user whose UUID is the first path segment.
 *
 * Existing tests verify the *table* RLS (`rls-isolation.integration.test.ts`)
 * but not the storage layer. If the path-prefix policy is dropped or
 * mis-written, a forged path could let user A list and download every
 * other user's private files. These tests pin the storage policy.
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

const BUCKET = 'personal-files';
const FILE_NAME = `rls-test-${Date.now()}.pdf`;
const PATH_A = `${TEST_USER_A.id}/${FILE_NAME}`;
const PATH_B = `${TEST_USER_B.id}/${FILE_NAME}`;

const PDF_BYTES = new Uint8Array(
  Buffer.from('%PDF-1.4\n%fake pdf for rls test\n%%EOF'),
);

async function cleanup() {
  // Use admin to remove any leftover fixtures. Best-effort.
  await admin.storage
    .from(BUCKET)
    .remove([PATH_A, PATH_B])
    .catch(() => {
      /* ignore */
    });
}

describe('storage RLS — personal-files bucket', () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();

    // Seed: each user uploads ONE file under their own user-id prefix.
    const blob = new Blob([PDF_BYTES], { type: 'application/pdf' });
    const upA = await clientA.storage.from(BUCKET).upload(PATH_A, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (upA.error) throw new Error(`seed A: ${upA.error.message}`);

    const upB = await clientB.storage.from(BUCKET).upload(PATH_B, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (upB.error) throw new Error(`seed B: ${upB.error.message}`);
  });

  afterAll(cleanup);

  it("User A's list of their own folder returns only their file (RLS scope by path prefix)", async () => {
    const { data, error } = await clientA.storage
      .from(BUCKET)
      .list(TEST_USER_A.id);
    expect(error).toBeNull();
    const names = (data ?? []).map((o) => o.name);
    expect(names).toContain(FILE_NAME);
  });

  it("User A's list of User B's folder returns empty (RLS blocks cross-user listing)", async () => {
    const { data } = await clientA.storage.from(BUCKET).list(TEST_USER_B.id);
    // Storage RLS makes the listing return empty rather than an error.
    // Either way, the file must not appear.
    const names = (data ?? []).map((o) => o.name);
    expect(names).not.toContain(FILE_NAME);
  });

  it("User A's download of User B's file fails (RLS blocks cross-user read)", async () => {
    const { data, error } = await clientA.storage.from(BUCKET).download(PATH_B);
    // Storage returns either `error` or `null`/empty data. We accept
    // either failure mode but never a successful cross-user read.
    if (!error && data) {
      const text = await data.text();
      // If we got bytes, they must not contain the PDF header — a
      // common false-pass mode is getting back a public placeholder.
      expect(text).not.toContain('%PDF');
    }
  });

  it("User A's upload to User B's path fails (RLS WITH CHECK blocks spoofed prefix)", async () => {
    const spoofPath = `${TEST_USER_B.id}/spoof-by-a.pdf`;
    const blob = new Blob([PDF_BYTES], { type: 'application/pdf' });
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(spoofPath, blob, {
        contentType: 'application/pdf',
        upsert: false,
      });
    expect(error).not.toBeNull();
    // Best-effort cleanup if the policy missed and the upload landed.
    await admin.storage
      .from(BUCKET)
      .remove([spoofPath])
      .catch(() => {});
  });

  it("User A's delete of User B's file fails (RLS blocks cross-user delete)", async () => {
    await clientA.storage.from(BUCKET).remove([PATH_B]);

    // Verify B's file still exists by admin-listing the folder.
    const { data } = await admin.storage.from(BUCKET).list(TEST_USER_B.id);
    const names = (data ?? []).map((o) => o.name);
    expect(names).toContain(FILE_NAME);
  });
});
