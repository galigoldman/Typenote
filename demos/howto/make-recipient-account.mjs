// Creates the second demo persona, "Daniel Cohen" — the classmate who joins a
// shared course in video 09. No content is seeded for him; his dashboard
// should look like a fresh student account until he opens the share link.
//   node demos/howto/make-recipient-account.mjs
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './demo-env.mjs';

export const RECIPIENT_EMAIL = 'daniel.demo@typenote.dev';
export const RECIPIENT_PASSWORD = 'TypenoteDemo!2026';
export const RECIPIENT_NAME = 'Daniel Cohen';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let user = null;
{
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    user = data.users.find((u) => u.email === RECIPIENT_EMAIL) ?? null;
    if (user || data.users.length < 1000) break;
    page++;
  }
}

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: RECIPIENT_EMAIL,
    password: RECIPIENT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: RECIPIENT_NAME },
  });
  if (error) throw new Error(error.message);
  user = data.user;
  console.log(`created ${RECIPIENT_EMAIL} (${user.id})`);
} else {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: RECIPIENT_PASSWORD,
    user_metadata: { full_name: RECIPIENT_NAME },
  });
  if (error) throw new Error(error.message);
  console.log(`${RECIPIENT_EMAIL} already exists (${user.id}) — password refreshed`);
}

const { error: profileError } = await admin
  .from('profiles')
  .update({ display_name: RECIPIENT_NAME })
  .eq('id', user.id);
if (profileError) console.warn(`profiles update skipped: ${profileError.message}`);
console.log('done');
