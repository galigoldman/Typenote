// Retake hygiene for video 08 (courses & folders). Run before EVERY capture:
//   node demos/howto/08-courses-folders/cleanup.mjs
// Undoes what a take creates:
//   1. Moves "Lecture 1 — Limits" back into the "Calculus 2" course
//      (the take moves it into the "Semester B" folder, which nulls course_id).
//   2. Deletes Maya's folders named "Semester B".
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from '../demo-env.mjs';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error } = await db.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (error) throw new Error(error.message);
const uid = session.user.id;

// 1. Reset the moved document back into Calculus 2.
const { data: calc } = await db
  .from('courses')
  .select('id,name')
  .eq('user_id', uid)
  .eq('name', 'Calculus 2')
  .limit(1);
const calcId = calc?.[0]?.id ?? null;

const { data: docs } = await db
  .from('documents')
  .select('id,title,course_id,folder_id')
  .eq('user_id', uid)
  .ilike('title', 'Lecture 1%Limits');

for (const d of docs ?? []) {
  if (d.course_id === calcId && d.folder_id === null) {
    console.log(`doc "${d.title}" already in place`);
    continue;
  }
  const { error: upErr } = await db
    .from('documents')
    .update({ folder_id: null, course_id: calcId })
    .eq('id', d.id);
  if (upErr) throw new Error(upErr.message);
  console.log(`reset doc "${d.title}" -> course_id=${calcId}, folder_id=null`);
}
if (!docs?.length) console.log('no "Lecture 1 — Limits" doc found');

// 2. Delete the demo folder(s).
const { data: folders } = await db
  .from('folders')
  .select('id,name')
  .eq('user_id', uid)
  .eq('name', 'Semester B');

for (const f of folders ?? []) {
  // Safety: anything still pointing at the folder gets detached first.
  await db.from('documents').update({ folder_id: null }).eq('folder_id', f.id);
  await db.from('courses').update({ folder_id: null }).eq('folder_id', f.id);
  const { error: delErr } = await db.from('folders').delete().eq('id', f.id);
  if (delErr) throw new Error(delErr.message);
  console.log(`deleted folder ${f.name} (${f.id})`);
}
if (!folders?.length) console.log('no "Semester B" folder to clean');
