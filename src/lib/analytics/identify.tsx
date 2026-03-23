'use client';

import { useEffect } from 'react';
import { usePostHog } from '@posthog/next';
import { createClient } from '@/lib/supabase/client';

/**
 * Identifies the authenticated user to PostHog using their Supabase UUID.
 * Resets PostHog identity on sign-out so sessions are not cross-linked.
 * Place inside PostHogProvider in the root layout.
 */
export function PostHogIdentify() {
  const posthog = usePostHog();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        posthog.identify(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    });

    // Check current session on mount
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        posthog.identify(user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [posthog]);

  return null;
}
