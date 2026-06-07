// Seeds the Maya Levi demo account with realistic university content so every
// video frame looks like a real student's workspace — never empty, never
// test data.
//
//   node demos/howto/seed-demo-content.mjs          seed (idempotent-ish: skips if course exists)
//   node demos/howto/seed-demo-content.mjs --reset  delete Maya's content, then seed fresh
//
// Requires: dev server running (for the version-history seeding pass) and
// demos/howto/auth.json baked by make-auth-state.mjs.
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  APP_URL,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  AUTH_STATE_PATH,
} from './demo-env.mjs';

const RESET = process.argv.includes('--reset');

// User-scoped client — every write goes through RLS exactly like the app.
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error: loginError } = await db.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (loginError) throw new Error(`login failed: ${loginError.message}`);
const uid = session.user.id;
console.log(`signed in as ${DEMO_EMAIL}`);

if (RESET) {
  // FK order: documents reference courses/folders.
  for (const table of [
    'documents',
    'ai_conversations',
    'course_materials',
    'personal_files',
    'courses',
    'folders',
  ]) {
    const { error } = await db.from(table).delete().eq('user_id', uid);
    if (error && !/does not exist|column/.test(error.message)) {
      console.warn(`reset ${table}: ${error.message}`);
    } else {
      console.log(`reset ${table}`);
    }
  }
}

const { data: existing } = await db
  .from('courses')
  .select('id,name')
  .eq('user_id', uid);
if ((existing ?? []).some((c) => c.name === 'Linear Algebra 1')) {
  console.log('content already seeded — run with --reset to rebuild');
  process.exit(0);
}

async function insertCourse(name, color, position) {
  const { data, error } = await db
    .from('courses')
    .insert({ user_id: uid, name, color, folder_id: null, position })
    .select()
    .single();
  if (error) throw new Error(`course ${name}: ${error.message}`);
  console.log(`course: ${name}`);
  return data;
}

async function insertDoc(course_id, title, canvas_type) {
  const { data, error } = await db
    .from('documents')
    .insert({
      user_id: uid,
      title,
      subject: 'other',
      canvas_type,
      folder_id: null,
      course_id,
    })
    .select()
    .single();
  if (error) throw new Error(`document ${title}: ${error.message}`);
  console.log(`  doc: ${title}`);
  return data;
}

const linalg = await insertCourse('Linear Algebra 1', '#3B82F6', 0);
const introcs = await insertCourse(
  'Introduction to Computer Science',
  '#8B5CF6',
  1,
);

await insertDoc(linalg.id, 'Lecture 4 — Eigenvalues & Eigenvectors', 'lined');
await insertDoc(linalg.id, 'Problem Set 3', 'blank');
const midterm = await insertDoc(linalg.id, 'Midterm Summary', 'grid');
await insertDoc(introcs.id, 'Lecture 7 — Recursion', 'lined');
await insertDoc(introcs.id, 'Big-O Cheat Sheet', 'dotted');

// ---- Version-history seeding ------------------------------------------------
// Video 07 shows the version sidebar, which needs real snapshots. We drive the
// real editor (so the stored content/pages JSON is exactly what the app
// produces), and snapshot between edits via the same RPC the app's server
// action calls.
console.log('seeding version history for "Midterm Summary"…');
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: AUTH_STATE_PATH,
});
const page = await ctx.newPage();

async function typeAndSave(text) {
  await page.keyboard.type(text, { delay: 10 });
  // Autosave debounces; wait for the Saved indicator to settle.
  await page
    .getByText('Saving...')
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  await page.getByText('Saved', { exact: true }).waitFor({ timeout: 20_000 });
}

await page.goto(`${APP_URL}/dashboard/documents/${midterm.id}`);
await page.locator('.ProseMirror').first().waitFor({ timeout: 30_000 });
await page
  .getByRole('button', { name: 'Type' })
  .click()
  .catch(() => {});
await page.locator('.ProseMirror').first().click();

await typeAndSave('Midterm Summary — key topics\n');
let { error: v1err } = await db.rpc('create_document_version', {
  p_document_id: midterm.id,
  p_trigger: 'idle',
});
if (v1err) console.warn(`snapshot 1: ${v1err.message}`);

await typeAndSave(
  '1. Vector spaces: span, basis, dimension\n2. Linear maps and matrices\n',
);
let { error: v2err } = await db.rpc('create_document_version', {
  p_document_id: midterm.id,
  p_trigger: 'periodic',
});
if (v2err) console.warn(`snapshot 2: ${v2err.message}`);

await typeAndSave(
  '3. Determinants and invertibility\n4. Eigenvalues: det(A - lambda I) = 0\n',
);

await browser.close();
console.log('done — demo content seeded');
