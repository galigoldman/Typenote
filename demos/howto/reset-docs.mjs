// Clears the content of one or more of Maya's documents (by title) so editor
// videos can be re-captured from a clean page.
//   node demos/howto/reset-docs.mjs "Lecture 4 — Eigenvalues & Eigenvectors" [...]
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from './demo-env.mjs';

const titles = process.argv.slice(2);
if (!titles.length) {
  console.error('usage: node reset-docs.mjs "<title>" [...]');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: session, error } = await db.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (error) throw new Error(error.message);

for (const title of titles) {
  const { data, error: e } = await db
    .from('documents')
    .update({ content: null, pages: { pages: [] } })
    .eq('user_id', session.user.id)
    .eq('title', title)
    .select('id');
  if (e) console.error(`${title}: ${e.message}`);
  else console.log(`reset ${data.length} doc(s): ${title}`);
}
