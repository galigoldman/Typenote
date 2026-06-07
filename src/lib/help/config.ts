/**
 * Shared configuration for the Daymo-powered help surfaces: the public
 * /help page and the in-app chat widget. One source of truth so both
 * surfaces present the same brand, videos, and suggested questions.
 *
 * The video bundle (output.mp4 + poster.jpg per demo, index.json with
 * embeddings, manifest.json) is published to the public Supabase Storage
 * bucket `help-videos` by `demos/howto/publish-help-assets.mjs`. A
 * same-origin copy of manifest.json (posters rewritten to /help/posters/*)
 * is committed under public/help/ so the gallery renders without any
 * cross-origin dependency.
 */
export const HELP_WIDGET_ID = 'typenote';

export const HELP_BRAND_NAME = 'Typenote';

/** Typenote's --primary (oklch(0.46 0.2 280)) as hex for non-Tailwind consumers. */
export const HELP_BRAND_COLOR = '#4a3cc2';

/** Same-origin manifest copy — used by the help page gallery and the widget. */
export const HELP_MANIFEST_URL = '/help/manifest.json';

export const HELP_SUGGESTED_QUESTIONS = [
  'How do I import my courses from Moodle?',
  'How do I write math in my notes?',
  'Can I share a course with classmates?',
  'How do I export a document to PDF?',
];

/** Where the published help bundle (index.json with embeddings) lives. */
export function helpBundleBaseUrl(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/help-videos`;
}
