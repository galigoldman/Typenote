# Research: Moodle Import & Sync

**Feature**: `004-moodle-import-sync` | **Date**: 2026-03-11

## R1: Extension ↔ Web App Communication

**Decision**: Use `externally_connectable` in Manifest V3 to allow the Typenote web app to send messages to the extension via `chrome.runtime.sendMessage(extensionId, message)`.

**Rationale**: This is the official Chrome-supported pattern for web page → extension communication. The web app at our domain is listed in the extension's `manifest.json` under `externally_connectable.matches`. The extension listens via `chrome.runtime.onMessageExternal`. No content script injection into our own app is needed.

**Alternatives considered**:
- `window.postMessage` via content script injected into the Typenote app — more complex, requires content script on our own domain, harder to secure
- `chrome.runtime.connectExternal` (long-lived port) — overkill for request/response pattern; `sendMessage` is simpler

**Key details**:
- Extension must have a stable ID (publish to Chrome Web Store or use `key` field for dev)
- Web app needs to know the extension ID (hardcoded or detected via a probe message)
- Extension detection: web app sends a ping message; if extension not installed, `chrome.runtime.lastError` fires

## R2: Dynamic Moodle Host Permissions

**Decision**: Use `optional_host_permissions` in manifest.json. When the student enters their Moodle URL, the extension requests permission for that specific domain via `chrome.permissions.request()`.

**Rationale**: We can't know every Moodle URL at build time. Chrome's `optional_host_permissions` lets the extension request access to new domains at runtime with user consent. This is the Chrome Web Store-approved pattern for extensions that need dynamic domain access.

**Alternatives considered**:
- Broad wildcard `<all_urls>` — Chrome Web Store would likely reject, and it's a security red flag for users
- Fixed list of known Moodle domains — doesn't scale, every new university requires an extension update

## R3: File Download + Upload via Extension

**Decision**: Extension content script or service worker fetches files from Moodle (has session cookies), then uploads the raw bytes to the Typenote API via `fetch()` to our endpoint.

**Rationale**: The extension inherits the user's Moodle cookies, so it can download files that require authentication. It then uploads to our API as a standard multipart form upload. Moodle session tokens never reach our server — only file bytes and metadata.

**Key details**:
- Service worker in MV3 can make cross-origin fetches to domains in `host_permissions`
- Files are fetched as `Blob`, then uploaded via `FormData` to our API
- Content hash (SHA-256) computed in the extension before upload, sent as metadata
- Server does dedup check before accepting the upload

## R4: Moodle Scraping Approach

**Decision**: Use content scripts injected into Moodle pages for DOM scraping. Exact selectors will be determined later using browser-use tooling to learn Moodle's DOM patterns.

**Rationale**: Moodle's HTML structure varies by theme and version, but core content areas have reasonably stable class names (e.g., `.course-content`, `.section`, `.activity`). Rather than hardcoding selectors now, we'll use browser-use to explore real Moodle instances and extract reliable patterns.

**Existing references**:
- [MoodleScraper (doebi)](https://github.com/doebi/MoodleScraper) — Python scraper, shows URL patterns for resources
- [moodle-scrape (dotnize)](https://github.com/dotnize/moodle-scrape) — JS scraper for Moodle v3.8+
- [Moodle Downloader extension](https://chromewebstore.google.com/detail/moodle-downloader/ohhocacnnfaiphiahofcnfakdcfldbnh) — Existing Chrome extension for downloading Moodle resources
- [moodle-dl](https://pypi.org/project/moodle-dl/) — Python tool that uses Moodle's mobile API (worth investigating as a fallback)

**Key patterns to extract** (deferred to browser-use phase):
- Dashboard/my courses page → enrolled course list with IDs
- Course page → sections with titles and ordering
- Section → file resources (pluginfile.php URLs) and link resources
- File metadata (name, size, type) from DOM or HTTP headers

## R5: Deduplication Strategy

**Decision**: Two-tier dedup — first by Moodle URL (fast, covers most cases), then by SHA-256 content hash (covers re-uploads and cross-course duplicates).

**Rationale**: Same Moodle URL almost always means same file (professors rarely change file content at the same URL). Content hash catches edge cases where the same file exists at different URLs or where a professor re-uploads modified content at the same URL.

**Implementation**:
1. When extension reports a file to import, server checks `moodle_files` table for matching `moodle_url` within the same section
2. If URL match found → check if content hash still matches (if not, file was modified → store new version)
3. If no URL match → check `moodle_files` for matching `content_hash` anywhere (cross-course dedup)
4. If hash match found → create reference only
5. If no match at all → accept upload, store file, create record

## R6: Shared Registry RLS Model

**Decision**: Shared tables (moodle_instances, moodle_courses, moodle_sections, moodle_files) are readable by any authenticated user. Writes go through server-side API routes using the Supabase service role key, not direct client writes.

**Rationale**: Any student should be able to read shared course data (that's the whole point of dedup). But writes must be controlled — we don't want students arbitrarily modifying shared records. The API routes validate and upsert shared data using the service role, while per-user tables (user_moodle_connections, user_course_syncs, user_file_imports) use standard user_id-based RLS.

**Alternatives considered**:
- Client-side writes with complex RLS (e.g., "can insert if not exists") — fragile, hard to get right for concurrent upserts
- Fully open writes — security risk, students could corrupt shared data
