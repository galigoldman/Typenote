// Retake hygiene for video 09 (share a course with your study group).
// Run BEFORE every capture:
//   node demos/howto/09-share-course/cleanup.mjs
//
// What a take dirties, and how this resets it:
//
// 1. SHARE LINKS — the video clicks "Create viewer link" on
//    "Linear Algebra 1", inserting a real course_share_links row. Maya's own
//    client deletes ALL her share links (RLS policy "Owner manages share
//    links" is FOR ALL, so the owner may delete). This makes the dialog show
//    the pristine "Create viewer link" / "Create contributor link" buttons
//    again and guarantees a fresh token each take.
//
// 2. DANIEL'S MEMBERSHIP — opening the link as Daniel runs the
//    join_course_via_link() RPC, which inserts a course_members row
//    (course_id, user_id, role). course_members has NO user-facing DELETE
//    path usable here without driving the UI ("self can remove" exists, but
//    the service-role client is simpler and also covers role drift), so we
//    delete Daniel's membership rows with the SERVICE-ROLE client. Joining
//    creates nothing else — the RPC writes exactly one row (see
//    supabase/migrations/20260526130000_course_sharing.sql §12).
//
// 3. DEFENSIVE SWEEP — if a stray take ever left Daniel-owned rows attached
//    to Maya's courses (documents / course_materials / personal_files —
//    possible because viewers still get a "New Document" button), remove
//    them too so his account stays a clean empty classmate account.
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from '../demo-env.mjs';

const RECIPIENT_EMAIL = 'daniel.demo@typenote.dev';

// ---- Maya's client (RLS, exactly like the app) ------------------------------
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error } = await db.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (error) throw new Error(error.message);
const mayaId = session.user.id;

// ---- Service-role client (bypasses RLS — needed for course_members) --------
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Maya deletes all her share links.
const { data: courses } = await db
  .from('courses')
  .select('id,name')
  .eq('user_id', mayaId);
const courseIds = (courses ?? []).map((c) => c.id);
if (courseIds.length) {
  const { data: links, error: linkErr } = await db
    .from('course_share_links')
    .delete()
    .in('course_id', courseIds)
    .select('id,role');
  if (linkErr) console.warn(`share links: ${linkErr.message}`);
  else console.log(`share links: deleted ${links?.length ?? 0}`);
}

// 2. Remove Daniel's memberships (service role).
const { data: profs, error: profErr } = await admin
  .from('profiles')
  .select('id')
  .eq('email', RECIPIENT_EMAIL);
if (profErr) throw new Error(profErr.message);
const danielId = profs?.[0]?.id;
if (!danielId) {
  console.warn(`recipient ${RECIPIENT_EMAIL} not found — run make-recipient-account.mjs`);
} else {
  const { data: mems, error: memErr } = await admin
    .from('course_members')
    .delete()
    .eq('user_id', danielId)
    .select('course_id,role');
  if (memErr) console.warn(`memberships: ${memErr.message}`);
  else console.log(`memberships: deleted ${mems?.length ?? 0}`);

  // 3. Defensive: any Daniel-owned content rows parked in Maya's courses.
  if (courseIds.length) {
    for (const table of ['documents', 'course_materials', 'personal_files']) {
      const { data: rows, error: e } = await admin
        .from(table)
        .delete()
        .eq('user_id', danielId)
        .in('course_id', courseIds)
        .select('id');
      if (e) console.warn(`${table}: ${e.message}`);
      else if (rows?.length) console.log(`${table}: removed ${rows.length} stray Daniel row(s)`);
    }
  }
}
console.log('cleanup done — dialog will show "Create viewer link" fresh; Daniel has no shared courses');
