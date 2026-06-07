// Retake hygiene for video 07 (export / share / version history).
// Run BEFORE every capture:
//   node demos/howto/07-export-share-versions/cleanup.mjs
//
// What a take dirties, and how this resets it:
//
// 1. SHARE LINKS — the video clicks "Create viewer link" on the
//    "Linear Algebra 1" course, which inserts a real course_share_links row.
//    We DELETE all of Maya's share links (RLS policy "Owner manages share
//    links" is FOR ALL, so her own client may delete them). This also makes
//    the dialog show the pristine "Create viewer link" button again and
//    guarantees a fresh token each take.
//
// 2. "Midterm Summary" CONTENT — the video restores the OLDEST seeded
//    snapshot (trigger 'idle', header line only), which overwrites
//    documents.pages and creates a 'before_restore' snapshot. Rather than
//    chaining restore RPCs (each call would mint yet another snapshot), we
//    write the canonical full state back DIRECTLY from a fixture
//    (midterm-full-state.json — captured from the seeded document before any
//    take; content + pages JSON exactly as the app produced them). A direct
//    UPDATE creates no version rows, so the reset is silent and idempotent.
//
// 3. VERSION LIST — takes accumulate rows: the restore mints a
//    'before_restore' snapshot, and navigating away from the editor fires the
//    beforeunload sendBeacon -> /api/version-snapshot -> a 'close' snapshot of
//    the rolled-back state. The canonical seeded list is exactly the TWO
//    OLDEST rows ('idle' + 'periodic', both rendered as "Auto-saved"), so we
//    delete every row newer than those two (RLS "Users can delete own
//    versions" allows it). Each take therefore opens the sidebar to the same
//    two-entry list.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from '../demo-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_TITLE = 'Midterm Summary';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error } = await db.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (error) throw new Error(error.message);
const uid = session.user.id;

// ---- 1. share links --------------------------------------------------------
const { data: courses } = await db
  .from('courses')
  .select('id,name')
  .eq('user_id', uid);
const courseIds = (courses ?? []).map((c) => c.id);
if (courseIds.length) {
  const { data: links, error: linkErr } = await db
    .from('course_share_links')
    .delete()
    .in('course_id', courseIds)
    .select('id,role,course_id');
  if (linkErr) {
    console.warn(
      `share links: could not delete (${linkErr.message}) — disable manually in the Share dialog`,
    );
  } else {
    console.log(`share links: deleted ${links?.length ?? 0}`);
  }
}

// ---- 2. restore Midterm Summary's full content from the fixture ------------
const { data: docs } = await db
  .from('documents')
  .select('id')
  .eq('user_id', uid)
  .eq('title', DOC_TITLE);
if (!docs?.length)
  throw new Error(
    `document "${DOC_TITLE}" not found — reseed with seed-demo-content.mjs`,
  );
const docId = docs[0].id;

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'midterm-full-state.json'), 'utf8'),
);
const { error: updErr } = await db
  .from('documents')
  .update({ content: fixture.content, pages: fixture.pages })
  .eq('id', docId);
if (updErr) throw new Error(`content reset failed: ${updErr.message}`);
console.log(`document: "${DOC_TITLE}" content reset to canonical full state`);

// ---- 3. prune version rows back to the two seeded snapshots ----------------
const { data: versions } = await db
  .from('document_versions')
  .select('id,trigger,created_at')
  .eq('document_id', docId)
  .order('created_at', { ascending: true });
const surplus = (versions ?? []).slice(2); // keep the 2 oldest (seeded idle + periodic)
if (surplus.length) {
  const { error: delErr } = await db
    .from('document_versions')
    .delete()
    .in(
      'id',
      surplus.map((v) => v.id),
    );
  if (delErr) console.warn(`versions: could not prune (${delErr.message})`);
  else
    console.log(
      `versions: pruned ${surplus.length} (${surplus.map((v) => v.trigger).join(', ')})`,
    );
} else {
  console.log('versions: already at the 2 seeded snapshots');
}
