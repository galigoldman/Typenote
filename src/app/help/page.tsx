import type { Metadata } from 'next';
import { HelpCenterClient } from './help-center-client';

export const metadata: Metadata = {
  title: 'Help Center — Typenote',
  description:
    'How-to videos and an AI assistant for Typenote: taking notes, writing math, importing from Moodle, sharing courses, and more.',
};

/**
 * Public help center (no login required — see the isPublicPage list in
 * src/lib/supabase/middleware.ts). Linked from the dashboard sidebar and
 * intended for the landing page / docs as well.
 */
export default function HelpPage() {
  return <HelpCenterClient />;
}
