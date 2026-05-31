/**
 * Pure URL-resolution helpers for Moodle file downloads.
 *
 * These are deliberately free of `chrome.*` and DOM globals at import time so
 * they can be unit-tested under the web app's jsdom vitest without mocking the
 * extension environment. The service worker imports them; all the I/O (fetch,
 * tabs) lives there.
 */

// File extensions Typenote can actually import. Mirrors ALLOWED_FILE_EXTENSIONS
// in the content scraper — kept in sync deliberately (small, rarely changes).
const KNOWN_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'doc',
  'pptx',
  'ppt',
  // Non-content types we still want to RECOGNISE (so extensionMatches can flag
  // an avatar PNG masquerading as a PDF) even though they're never imported.
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'zip',
  'rar',
  'mp4',
  'mp3',
  'xlsx',
  'xls',
]);

// Path fragments that mark a pluginfile URL as chrome (avatar, theme logo,
// course overview image) rather than the actual resource the user wants. These
// commonly appear in a resource view page's header — BEFORE the real file in
// source order — so a naive "first match" would grab them.
const NON_CONTENT_PATH_FRAGMENTS = [
  '/user/icon/',
  '/theme/',
  '/course/overviewfiles/',
];

/**
 * Extracts the first `pluginfile.php` download URL from raw HTML. Returns null
 * when none is present. Moodle HTML-escapes `&` as `&amp;` inside attribute
 * values, so we decode that back to a usable URL. The service worker has no
 * DOMParser, hence a regex scan of the markup.
 *
 * Prefer `pickPluginfileUrl` over this for resource pages — it avoids grabbing
 * an avatar/logo that precedes the real file. This raw "first match" helper is
 * exported mainly for testing and as the primitive `pickPluginfileUrl` builds on.
 */
export function extractPluginfileUrl(html: string): string | null {
  const match = html.match(
    /https?:\/\/[^\s"'<>\\]+\/pluginfile\.php\/[^\s"'<>\\]+/,
  );
  if (!match) return null;
  return decodeAmp(match[0]);
}

/**
 * Picks the best `pluginfile.php` URL from a resource view page's HTML.
 *
 * Priority:
 *   1. A link carrying `forcedownload=1` — that's unambiguously the file Moodle
 *      wants you to download.
 *   2. The first link whose path is NOT avatar/theme/overview chrome.
 *   3. The first link of any kind (last resort).
 *
 * Returns null when the HTML contains no pluginfile link at all. Decodes
 * `&amp;` on the chosen URL.
 */
export function pickPluginfileUrl(html: string): string | null {
  const matches = html.match(
    /https?:\/\/[^\s"'<>\\]+\/pluginfile\.php\/[^\s"'<>\\]+/g,
  );
  if (!matches || matches.length === 0) return null;

  const decoded = matches.map(decodeAmp);

  const forced = decoded.find((u) => /[?&]forcedownload=1\b/.test(u));
  if (forced) return forced;

  const content = decoded.find((u) => !isNonContentPluginfile(u));
  if (content) return content;

  return decoded[0];
}

/**
 * True when a pluginfile URL points at avatar/theme/course-overview chrome
 * rather than an actual resource file.
 */
export function isNonContentPluginfile(url: string): boolean {
  return NON_CONTENT_PATH_FRAGMENTS.some((frag) => url.includes(frag));
}

/**
 * Returns the lowercased file extension implied by a URL or filename, or null
 * if it can't be determined or isn't a recognised type. Strips query/hash and
 * percent-decodes the last path segment first (Moodle encodes spaces etc.).
 */
export function fileExtensionOf(urlOrName: string): string | null {
  if (!urlOrName) return null;
  // Last path segment, without query/hash.
  let segment = urlOrName.split(/[?#]/)[0];
  segment = segment.substring(segment.lastIndexOf('/') + 1);
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // Leave as-is if it isn't valid percent-encoding.
  }
  const dot = segment.lastIndexOf('.');
  if (dot < 0 || dot === segment.length - 1) return null;
  const ext = segment.slice(dot + 1).toLowerCase();
  return KNOWN_EXTENSIONS.has(ext) ? ext : null;
}

/**
 * Guards against resolving to the wrong file (e.g. an avatar PNG instead of the
 * lecture PDF). Returns false ONLY when both extensions are known AND they
 * differ. If either side's extension is unknown/undeterminable we return true
 * (don't block) — we'd rather download a correctly-resolved oddball than reject
 * a real file because we couldn't classify it.
 */
export function extensionMatches(
  resolvedUrl: string,
  expectedFileName: string,
): boolean {
  const got = fileExtensionOf(resolvedUrl);
  const want = fileExtensionOf(expectedFileName);
  if (got === null || want === null) return true;
  return got === want;
}

function decodeAmp(url: string): string {
  return url.replace(/&amp;/g, '&');
}
