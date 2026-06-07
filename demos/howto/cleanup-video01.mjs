// Deletes the "Calculus 2" course (and its documents) that video 01 creates
// live, so re-captures don't accumulate duplicates. Run between takes:
//   node demos/howto/cleanup-video01.mjs
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from './demo-env.mjs';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error } = await db.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (error) throw new Error(error.message);

const { data: courses } = await db
  .from('courses')
  .select('id,name')
  .eq('user_id', session.user.id)
  .eq('name', 'Calculus 2');

for (const c of courses ?? []) {
  await db.from('documents').delete().eq('course_id', c.id);
  await db.from('courses').delete().eq('id', c.id);
  console.log(`deleted course ${c.name} (${c.id})`);
}
if (!courses?.length) console.log('nothing to clean');
