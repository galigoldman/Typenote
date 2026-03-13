const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/**
 * Strip characters that are unsafe for filenames and return a clean string.
 * Returns "Untitled" when the sanitized result would be empty.
 */
export function sanitizeFilename(title: string): string {
  const cleaned = title.replace(UNSAFE_FILENAME_CHARS, '').trim();
  return cleaned || 'Untitled';
}
