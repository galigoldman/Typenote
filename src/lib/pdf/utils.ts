const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/**
 * Strip characters that are unsafe for filenames and return a clean string.
 * Returns "Untitled" when the sanitized result would be empty.
 */
export function sanitizeFilename(title: string): string {
  const cleaned = title.replace(UNSAFE_FILENAME_CHARS, '').trim();
  return cleaned || 'Untitled';
}

/**
 * Trigger a browser file download from a Blob.
 * Creates a temporary anchor element, clicks it, then cleans up.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
