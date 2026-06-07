// Deletes the 'lecture-3-eigenvalues' personal file that video 06 uploads
// live (table row + storage object + focus-file attachments + embeddings),
// so re-captures don't accumulate duplicates. Run before EVERY capture:
//   node demos/howto/06-your-files/cleanup.mjs
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
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

// Admin client only for content_embeddings (RLS blocks the user client there).
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: files } = await db
  .from('personal_files')
  .select('id, file_name, storage_path')
  .eq('user_id', session.user.id)
  .ilike('file_name', '%lecture-3-eigenvalues%');

for (const f of files ?? []) {
  // Focus-file attachments referencing this file (Maya owns the documents).
  const { error: ctxErr } = await db
    .from('document_context_files')
    .delete()
    .eq('file_type', 'personal_file')
    .eq('file_id', f.id);
  if (ctxErr) console.warn(`context-file cleanup failed: ${ctxErr.message}`);

  // Embeddings created by the server-side AI indexing on upload.
  const { error: embErr } = await admin
    .from('content_embeddings')
    .delete()
    .eq('source_type', 'personal_file')
    .eq('source_id', f.id);
  if (embErr) console.warn(`embeddings cleanup failed: ${embErr.message}`);

  // Storage object (path shape: `${userId}/${courseId}/${fileName}`).
  const { error: stErr } = await db.storage
    .from('personal-files')
    .remove([f.storage_path]);
  if (stErr) console.warn(`storage remove failed (${f.storage_path}): ${stErr.message}`);

  const { error: rowErr } = await db
    .from('personal_files')
    .delete()
    .eq('id', f.id);
  if (rowErr) console.warn(`row delete failed: ${rowErr.message}`);
  else console.log(`deleted personal file ${f.file_name} (${f.id})`);
}
if (!files?.length) console.log('nothing to clean');
