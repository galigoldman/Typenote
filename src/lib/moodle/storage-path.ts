/**
 * Storage-key helpers for Moodle file uploads.
 *
 * Files are stored under a content-hash key, so the extension appended after
 * the hash is purely cosmetic — the real MIME type lives in
 * `moodle_files.mime_type`. The danger is that the "filename" we receive is
 * often the Moodle *activity title* (e.g. "2025.12.24 - שיעור (CML ו-SML)"),
 * not a real filename. Naively taking everything after the last dot as the
 * extension produces keys with spaces / parens / unicode, which Supabase
 * Storage rejects with `InvalidKey`.
 */

/**
 * Returns a safe, lowercase storage extension for a display name, or '' when
 * the name has no usable extension. Only a short alphanumeric tail (1–8 chars)
 * counts — anything else (spaces, punctuation, unicode, a date fragment) is
 * treated as "no extension" so it never leaks into the storage key.
 */
export function safeStorageExtension(fileName: string): string {
  if (!fileName.includes('.')) return '';
  const tail = fileName.split('.').pop() ?? '';
  return /^[a-zA-Z0-9]{1,8}$/.test(tail) ? tail.toLowerCase() : '';
}

/**
 * Builds the content-hash storage key for a Moodle file. The extension is
 * appended only when `safeStorageExtension` yields a clean one; otherwise the
 * bare hash is used (still a valid, unique key).
 */
export function buildStorageFileName(
  contentHash: string,
  fileName: string,
): string {
  const ext = safeStorageExtension(fileName);
  return ext ? `${contentHash}.${ext}` : contentHash;
}
