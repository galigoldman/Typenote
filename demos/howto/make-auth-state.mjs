// Creates (or refreshes) the "Maya Levi" demo account and bakes a Playwright
// storageState at demos/howto/auth.json. Every .demo file references that
// state via frontmatter `auth: { storageState: "./auth.json" }`, so captures
// start logged-in on the dashboard with no login UI in frame.
//
// Usage: node demos/howto/make-auth-state.mjs   (dev server must be running)
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_URL,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_NAME,
  AUTH_STATE_PATH,
} from './demo-env.mjs';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page++;
  }
}

let user = await findUserByEmail(DEMO_EMAIL);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });
  if (error) throw new Error(error.message);
  user = data.user;
  console.log(`created demo user ${DEMO_EMAIL} (${user.id})`);
} else {
  // Make sure the password matches what the seed/capture scripts expect.
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: DEMO_PASSWORD,
    user_metadata: { full_name: DEMO_NAME },
  });
  if (error) throw new Error(error.message);
  console.log(`demo user already exists (${user.id}) — password refreshed`);
}

// The profile row is what the UI reads for display names (e.g. "by Maya Levi"
// on shared course cards).
const { error: profileError } = await admin
  .from('profiles')
  .update({ display_name: DEMO_NAME })
  .eq('id', user.id);
if (profileError)
  console.warn(`profiles update skipped: ${profileError.message}`);

// Bake the storageState by logging in through the real UI.
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
await page.goto(`${APP_URL}/login`);
await page.getByLabel('Email').fill(DEMO_EMAIL);
await page.getByLabel('Password').fill(DEMO_PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL('**/dashboard**', { timeout: 20_000 });
// Pre-dismiss the first-run LaTeX onboarding popover so it never appears
// mid-video (the flag lives in localStorage and rides along in storageState).
await page.evaluate(() => {
  localStorage.setItem('typenote:latex-onboarding-dismissed', 'true');
});
await ctx.storageState({ path: AUTH_STATE_PATH });
await browser.close();
console.log(`wrote ${AUTH_STATE_PATH}`);
