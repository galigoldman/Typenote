// Undoes everything a capture of video 04 (Moodle import) creates, so
// re-captures always start from the "not connected" state. Run between takes:
//   node demos/howto/04-moodle-import/cleanup.mjs
//
// A successful take writes:
//   - user_moodle_connections (Maya)           -> connect card state
//   - moodle_instances 'moodle.tau.ac.il'      -> shared registry (admin-written)
//   - moodle_courses / moodle_sections / moodle_files under that instance
//   - user_course_syncs + a NEW Typenote course "Linear Algebra 1" (duplicate
//     of the seeded one — the sync flow always creates its own course)
//   - user_file_imports (only if the upload endpoint ran; the demo stub
//     skips real uploads, but delete defensively)
//
// Per-user rows are deleted as Maya (RLS allows it). The shared moodle_*
// registry rows are service-role-only writes (see migration 00008) — Maya's
// delete attempts on them fail under RLS and are tolerated with a warning.
// Leftover registry rows are harmless for retakes: with Maya's
// user_course_syncs / user_file_imports gone, the sync dialog shows the
// courses as "New" again and every file as selectable.
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from '../demo-env.mjs';

const DEMO_DOMAIN = 'moodle.tau.ac.il';

const maya = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error: authError } = await maya.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (authError) throw new Error(authError.message);
const userId = session.user.id;

// 1. Capture the Typenote course ids the sync flow created BEFORE deleting
//    the sync rows (seeded courses never have user_course_syncs rows, so
//    everything found here is a take artifact).
let syncCourseIds = [];
try {
  const { data: syncs, error } = await maya
    .from('user_course_syncs')
    .select('id, course_id')
    .eq('user_id', userId);
  if (error) throw error;
  syncCourseIds = [
    ...new Set((syncs ?? []).map((s) => s.course_id).filter(Boolean)),
  ];
  console.log(
    `found ${syncs?.length ?? 0} user_course_syncs (linked courses: ${syncCourseIds.length})`,
  );
} catch (e) {
  console.warn('reading user_course_syncs failed:', e.message);
}

// 2. user_file_imports (FK -> user_course_syncs, delete first)
try {
  const { error } = await maya
    .from('user_file_imports')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
  console.log('deleted user_file_imports');
} catch (e) {
  console.warn('deleting user_file_imports failed:', e.message);
}

// 3. user_course_syncs
try {
  const { error } = await maya
    .from('user_course_syncs')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
  console.log('deleted user_course_syncs');
} catch (e) {
  console.warn('deleting user_course_syncs failed:', e.message);
}

// 4. The duplicate Typenote course(s) the sync created (empty of documents,
//    but delete documents first to mirror cleanup-video01.mjs).
for (const courseId of syncCourseIds) {
  try {
    await maya.from('documents').delete().eq('course_id', courseId);
    const { error } = await maya
      .from('courses')
      .delete()
      .eq('id', courseId)
      .eq('user_id', userId);
    if (error) throw error;
    console.log(`deleted sync-created course ${courseId}`);
  } catch (e) {
    console.warn(`deleting course ${courseId} failed:`, e.message);
  }
}

// 5. Maya's Moodle connection — this is what flips the dashboard card back
//    to the "Enter your Moodle URL" connect state.
try {
  const { error } = await maya
    .from('user_moodle_connections')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
  console.log('deleted user_moodle_connections');
} catch (e) {
  console.warn('deleting user_moodle_connections failed:', e.message);
}

// 6. Shared registry (moodle_instances and, via cascade, moodle_courses /
//    moodle_sections / moodle_files), scoped to the fake demo domain only.
//    These tables have no user-delete RLS policy (writes are server-side
//    only), so this is EXPECTED to be a no-op for Maya — attempted anyway
//    per FK order, tolerated with a warning. Leftovers don't affect retakes.
try {
  const { data: instance, error: findError } = await maya
    .from('moodle_instances')
    .select('id')
    .eq('domain', DEMO_DOMAIN)
    .maybeSingle();
  if (findError) throw findError;
  if (instance) {
    const { error } = await maya
      .from('moodle_instances')
      .delete()
      .eq('id', instance.id);
    if (error) throw error;
    // RLS silently filters rows it won't delete — verify.
    const { data: still } = await maya
      .from('moodle_instances')
      .select('id')
      .eq('id', instance.id)
      .maybeSingle();
    if (still) {
      console.warn(
        'registry rows remain (RLS blocks user deletes) — harmless for retakes',
      );
    } else {
      console.log(
        `deleted moodle_instances row for ${DEMO_DOMAIN} (cascades registry)`,
      );
    }
  } else {
    console.log(`no moodle_instances row for ${DEMO_DOMAIN}`);
  }
} catch (e) {
  console.warn(
    'deleting shared registry failed (expected under RLS):',
    e.message,
  );
}

// 7. Verify the connect state is restored.
const { count } = await maya
  .from('user_moodle_connections')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId);
console.log(
  count === 0
    ? 'VERIFIED: no Moodle connection remains — dashboard will show the connect state.'
    : `WARNING: ${count} user_moodle_connections row(s) remain!`,
);
