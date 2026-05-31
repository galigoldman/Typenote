# Moodle sync: speed, parallelism, reliability, and working cancel

Date: 2026-05-31
Status: approved

## Problem

Two bugs shipped to `main`/`dev`:

1. **Full-course sync takes hours.** For every file, the extension opened a fresh
   popup browser window (`openScrapeWindow`), navigated it to the Moodle resource
   page, scraped the DOM for the `pluginfile.php` link, then closed the window —
   serially, one window per file. Window create/destroy + focus juggling per file
   is the cost; the resolution _strategy_ was fine, the _mechanism_ was the
   regression.
2. **Pressing X / Cancel didn't stop downloads.** The download loop never checked
   the cancel flag (only the permission-wait poll did), so closing the dialog let
   every remaining file download to completion.

History note: the pre-popup resolver (`0af40a1`) reused a single tab and only fell
back to `?redirect=1` when scraping found nothing. Commit `7ea9ec2` swapped the
reused tab for a per-file popup window — that is what made it slow. So the fix is
to go lighter than even the original, not heavier.

## How Moodle resources behave (drives the resolver)

A Moodle "file resource" has an instructor-set display mode:

| Display mode               | `GET view.php?id=…` (or `?redirect=1`) returns                   |
| -------------------------- | ---------------------------------------------------------------- |
| Automatic / Force download | 302 → the `pluginfile.php` file directly                         |
| Open / In pop-up           | usually 302 → the file                                           |
| Embed / In frame           | an HTML viewer page with the file in `<object>`/`<iframe>`/`<a>` |

The download fetch already follows redirects and rejects `text/html`. So for the
common force-download/open case, `?redirect=1` resolves with **zero extra
requests** — the download fetch itself lands on the file.

## Design

### Tiered resolution (cheapest first)

`resolveFileUrl(moodleUrl)`:

1. Already a `pluginfile.php` URL (all folder children + link-sweep items — the
   majority) → return as-is.
2. `/mod/resource/view.php` (or `/mod/folder/view.php`) → return `url?redirect=1`.
   No extra request; the download fetch follows it.
3. Otherwise → return as-is.

`handleDownloadAndUpload` (the download step):

1. Fetch `downloadUrl` (`credentials: 'include'`, `redirect: 'follow'`).
2. If the response is **HTML** (embed mode), parse the `pluginfile.php` link out
   of _that same response body_ (no extra GET) via `pickPluginfileUrl`, then
   re-fetch the real file.
3. If still HTML / unparseable → **escalate once** to a single reused background
   tab (`resolveViaTab`, serialized by a mutex so the ≤4 parallel workers share
   one tab), DOM-scraping via the existing `scrapeFileUrl`.
4. If that also fails → throw → the file is counted failed and shows up in the
   existing **Retry failed** list. No silent wrong-file, no hang.

### Correctness guards

- **Smart-pick** (`pickPluginfileUrl`): among all `pluginfile.php` matches in the
  HTML, prefer one with `forcedownload=1`; otherwise the first whose path is NOT
  under `/user/icon/`, `/theme/`, or `/course/overviewfiles/` (avatars / logos /
  course images that appear in the page header before the real content);
  otherwise the first match. Decodes `&amp;`.
- **Extension validation** (`extensionMatches`): after resolving, if the resolved
  file's extension and the expected filename's extension are both known and
  differ, reject — catches a wrong-URL slip regardless of how it resolved. The
  existing "not text/html" check stays.

### Parallel downloads + cancel (web app)

- `runWithConcurrency(items, worker, { concurrency: 4, shouldCancel })` — bounded
  worker pool, `shouldCancel` (reads `pollCancelRef.current`) checked before each
  item. In-flight ≤4 finish, then the pool stops pulling. Cancel = "stop starting
  new work", not "abort in-flight" (there is no abort channel to the extension);
  communicated via "N downloaded before stopping".
- Cancel button rendered during `syncing` / `scraping-content`.

### Robustness fixes

- `handleRetryFailed` wrapped in try/catch → on a pre-download throw it lands on
  `error` instead of wedging on `syncing` with a no-op Cancel button.
- `loadCourses` resets `pollCancelRef.current = false` (symmetry with
  sync/preview/retry; future-proofs against a stale `true`).

## Units & boundaries

- `extension/src/lib/url-resolve.ts` — **pure**, no chrome/DOM globals at import:
  `extractPluginfileUrl(html)`, `pickPluginfileUrl(html)`, `extensionMatches(resolvedUrl, expectedFileName)`,
  `fileExtensionOf(urlOrName)`. Imported by the service worker; unit-tested under
  the root jsdom vitest.
- `src/lib/concurrency.ts` — pure `runWithConcurrency` (already exists, tested).
- Service worker wires the tiers + the reused fallback tab + mutex.
- Dialog wires parallelism + cancel + the two robustness fixes.

## Testing

- `extension/src/lib/url-resolve.test.ts`: avatar/theme/overviewfiles skipped;
  `forcedownload` preferred; `&amp;` decoded; no-match/relative → null; extension
  mismatch detected; matching/unknown extensions accepted.
- `src/lib/concurrency.test.ts`: order, max-concurrency, cancel-mid-flight,
  up-front cancel, empty, error isolation (already present).
- `src/components/dashboard/moodle-sync-dialog.test.tsx`: new test — Cancel
  mid-sync stops further downloads and shows the cancelled message.
- CI: add `extension/src/**/*.test.ts` to `vitest.config.ts` `include` so the
  existing `pnpm test` step runs the extension unit test (no new deps; pure
  module needs no chrome mocks). Extension `tsc`/`esbuild` build unchanged.

## Out of scope

- Aborting in-flight downloads (no message channel to the extension; bounded to
  ≤4 stragglers — acceptable).
- E2E for real Moodle sync (needs a live Moodle session + packed extension; can't
  run against seeded local Supabase).
- Version bump already done: `0.2.0` → `0.2.1` (web app accepts `>=` minimum).
