/**
 * Storage RLS — coverage for the OTHER two storage buckets the app uses,
 * with their distinct access models. Companion to
 * `storage-rls.integration.test.ts` which covers `personal-files`.
 *
 *   - `course-materials`:  same per-user path-prefix RLS as personal-files
 *   - `moodle-materials`:  shared "any authenticated user can read"; no
 *                          regular-user writes (service-role only)
 *
 * Why this matters: each bucket has its OWN policy set. A migration
 * could drop one bucket's policy without affecting the other, and the
 * existing personal-files test would still pass. Per-bucket tests
 * catch that.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_ANON_KEY,
  TEST_USER_A,
  TEST_USER_B,
  createAdminClient,
  createUserClient,
} from '@/test/supabase-client';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

const admin = createAdminClient();

const PDF_BYTES = new Uint8Array(
  Buffer.from('%PDF-1.4\n%fake pdf for storage rls\n%%EOF'),
);

// ─── course-materials ──────────────────────────────────────────────

describe('storage RLS — course-materials bucket (per-user path prefix)', () => {
  const BUCKET = 'course-materials';
  const FILE_NAME = `rls-cm-${Date.now()}.pdf`;
  const PATH_A = `${TEST_USER_A.id}/${FILE_NAME}`;
  const PATH_B = `${TEST_USER_B.id}/${FILE_NAME}`;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  async function cleanup() {
    await admin.storage
      .from(BUCKET)
      .remove([PATH_A, PATH_B])
      .catch(() => {});
  }

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
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

  it("User A cannot list User B's folder", async () => {
    const { data } = await clientA.storage.from(BUCKET).list(TEST_USER_B.id);
    expect((data ?? []).map((o) => o.name)).not.toContain(FILE_NAME);
  });

  it("User A's upload to User B's path is rejected", async () => {
    const spoofPath = `${TEST_USER_B.id}/spoof-cm.pdf`;
    const blob = new Blob([PDF_BYTES], { type: 'application/pdf' });
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(spoofPath, blob, {
        contentType: 'application/pdf',
        upsert: false,
      });
    expect(error).not.toBeNull();
    await admin.storage
      .from(BUCKET)
      .remove([spoofPath])
      .catch(() => {});
  });

  it("User A's delete of User B's file is silently noop'd", async () => {
    await clientA.storage.from(BUCKET).remove([PATH_B]);
    const { data } = await admin.storage.from(BUCKET).list(TEST_USER_B.id);
    expect((data ?? []).map((o) => o.name)).toContain(FILE_NAME);
  });
});

// ─── moodle-materials ──────────────────────────────────────────────

describe('storage RLS — moodle-materials bucket (shared read, no user writes)', () => {
  const BUCKET = 'moodle-materials';
  // moodle-materials is a SHARED bucket — paths are NOT prefixed by
  // user id. We seed a known fixture as admin (the only role allowed
  // to write) and verify each access mode.
  const FIXTURE_PATH = `rls-fixtures/moodle-fixture-${Date.now()}.pdf`;
  let clientA: SupabaseClient;
  let anonClient: SupabaseClient;

  async function cleanup() {
    await admin.storage
      .from(BUCKET)
      .remove([FIXTURE_PATH])
      .catch(() => {});
  }

  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await cleanup();

    // Seed with admin (service role); no user policy permits INSERT.
    const blob = new Blob([PDF_BYTES], { type: 'application/pdf' });
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(FIXTURE_PATH, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (error) throw new Error(`moodle seed: ${error.message}`);
  });

  afterAll(cleanup);

  it('any authenticated user CAN download the fixture (shared-read policy)', async () => {
    const { data, error } = await clientA.storage
      .from(BUCKET)
      .download(FIXTURE_PATH);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const text = await data!.text();
    // The bytes we uploaded survive a round-trip.
    expect(text).toContain('%PDF-1.4');
  });

  it('an anon (signed-out) client CANNOT download the fixture', async () => {
    const { data, error } = await anonClient.storage
      .from(BUCKET)
      .download(FIXTURE_PATH);
    if (!error && data) {
      const text = await data.text();
      // Anything other than a failure must NOT contain the PDF bytes.
      expect(text).not.toContain('%PDF-1.4');
    }
  });

  it('a regular authenticated user CANNOT upload to moodle-materials (service-role only)', async () => {
    const blob = new Blob([PDF_BYTES], { type: 'application/pdf' });
    const sneakyPath = `rls-fixtures/sneak-by-user-${Date.now()}.pdf`;
    const { error } = await clientA.storage
      .from(BUCKET)
      .upload(sneakyPath, blob, {
        contentType: 'application/pdf',
        upsert: false,
      });
    expect(error).not.toBeNull();
    await admin.storage
      .from(BUCKET)
      .remove([sneakyPath])
      .catch(() => {});
  });

  it('a regular authenticated user CANNOT delete from moodle-materials', async () => {
    await clientA.storage.from(BUCKET).remove([FIXTURE_PATH]);
    // Admin can still see the fixture — it was not actually removed.
    const { data, error } = await admin.storage
      .from(BUCKET)
      .download(FIXTURE_PATH);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});
