'use client';

import { createClient } from './client';

/**
 * Initiates Google OAuth sign-in using a Safari-compatible redirect pattern.
 *
 * Safari (especially on iPad/iOS) may block programmatic redirects that happen
 * after an `await` boundary — the browser no longer considers them user-initiated.
 * Using `skipBrowserRedirect: true` lets us get the OAuth URL from Supabase and
 * assign `window.location.href` ourselves, keeping the redirect in the same
 * synchronous-ish call stack as the user gesture.
 */
export async function signInWithGoogle() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    // Fall back to the login page with an error indicator
    window.location.href = '/login?error=oauth_init_failed';
    return;
  }

  // Navigate directly — stays within user-gesture context for Safari
  window.location.href = data.url;
}
