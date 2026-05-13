# Extension Readiness — Design

**Date:** 2026-05-13
**Status:** Draft
**Branch:** `feat/extension-readiness`

## Context

The Moodle Chrome extension lives at `extension/` and was scaffolded as part of spec `004-moodle-import-sync`. It is structurally complete (Manifest V3 service worker, content scripts, full message protocol) but has never been verified end-to-end and is not production-ready in three concrete ways:

1. **No platform gating.** The web app renders the Moodle UI on every device. On iPad/mobile, `chrome.runtime` is `undefined`, so detection silently fails and the user sees a disabled "Install Extension" card — broken-looking, not hidden.
2. **Manifest is too permissive for the Chrome Web Store.** `host_permissions: ["<all_urls>"]` is a major review red flag. The service worker already implements `chrome.permissions.request()` per-origin (`REQUEST_PERMISSION` handler), but no UI calls it — the extension currently relies on the manifest-granted `<all_urls>`.
3. **Detection is fragile.** No timeout on PING, no version handshake, no install URL, and `NEXT_PUBLIC_EXTENSION_ID` is missing from `.env.local.example`. A developer setting up the project locally hits a silent dead-end.

This spec covers making the extension installable, detectable, and gated correctly on supported platforms only. It does **not** cover the Chrome Web Store upload itself or an in-app "Install now" call-to-action — both deferred.

## Goals

- Moodle UI is visible **only** on desktop Chromium browsers (pointer-fine input + `chrome.runtime` present).
- Extension detection is bounded (2 s), deterministic, and gracefully handles four classes of failure.
- Manifest is tightened so a future CWS submission has a high chance of approval on first review.
- A local-dev path is documented so anyone can load and verify the extension in ~10 minutes.

## Non-Goals (explicitly deferred)

- Actual Chrome Web Store upload + listing.
- Wiring the "Install Extension" button to a real CWS URL.
- Auto-detection after install (today requires page refresh; documented as such).
- Persistent per-file failure logs for retried downloads.
- E2E coverage of the real sync flow (requires loading a real extension into Playwright — non-trivial; user explicitly opted for the minimal gating-only Playwright spec).

## Architecture

Three units, single-responsibility each. The split keeps "what platform is this?" separate from "what is the extension doing?", so either can be changed without touching the other.

### `src/hooks/use-extension-platform.ts` _(new)_

Returns `{ isSupportedPlatform: boolean }`. Pure feature detection. Two checks:

- `window.matchMedia('(pointer: fine)').matches` — skips touch-primary devices (iPad, phones, touch-only Chromebooks).
- `typeof window.chrome?.runtime?.sendMessage === 'function'` — skips Firefox, Safari, and any environment without the Chrome extension messaging API.

SSR-safe: returns `false` on the server, hydrates to the real value on the client. No `useEffect` setState — uses `useSyncExternalStore` so there's no hydration flash.

### `src/components/dashboard/extension-gate.tsx` _(new)_

```tsx
<ExtensionGate>{children}</ExtensionGate>
```

Renders `children` only when `useExtensionPlatform().isSupportedPlatform` is `true`. The CSS layer also applies a `hidden pointer-fine:block` (or equivalent Tailwind 4) class so the children never paint on mobile during hydration. Belt-and-suspenders: CSS hides on mobile even if the JS gate hasn't run yet.

### `src/hooks/use-moodle-extension.ts` _(modified)_

State machine moves from the current `{ isInstalled, isChecking }` shape to a discriminated union:

```ts
type ExtensionState =
  | { status: 'checking' }
  | { status: 'installed'; version: string }
  | { status: 'not-installed' }
  | { status: 'version-mismatch'; installedVersion: string };
```

PING is wrapped in a 2-second timeout. The response's `version` is compared against `EXPECTED_EXTENSION_VERSION` (constant in the hook, set to `'0.2.0'`) by exact string equality at v0 — we'll move to semver comparison once we ship a 1.x. Dev-only `console.warn` if `NEXT_PUBLIC_EXTENSION_ID` is missing.

### Interview-driven note

The architecture choice here is a textbook _separation of concerns_: the "is this a supported platform?" question is data-independent of "is the extension installed and what version?". One hook per question, one component for composition. If we ever support a Firefox build of the extension, only `useExtensionPlatform` changes — `useMoodleExtension` doesn't notice.

## State matrix

Five levels, evaluated top-down. The first level that does not pass short-circuits everything below it.

| Level | Condition                                            | UI                                                                                                             |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | Touch / non-Chromium                                 | Nothing (silent hide via CSS + JS)                                                                             |
| 2a    | `status: 'checking'`                                 | `<MoodleCardSkeleton>` — pulsing placeholder                                                                   |
| 2b    | `status: 'not-installed'`                            | "Install the Typenote extension to sync Moodle" card; install button disabled (placeholder for future CWS URL) |
| 2c    | `status: 'version-mismatch'`                         | "Update the Typenote extension" card showing both installed and required versions                              |
| 3a    | Extension installed, no `moodle_connections` row     | URL input + Connect (existing `<MoodleConnectionSetup>` shape)                                                 |
| 3b    | Connection saved, no host permission for that origin | Inline "Grant access to `{domain}`" + button → `requestPermission()`                                           |
| 3c    | Connection saved + permission granted                | Continue to Level 4                                                                                            |
| 4a    | User clicks Sync, login check in flight              | Inline spinner on Sync button                                                                                  |
| 4b    | Not logged in                                        | "Log into Moodle to continue" + new-tab link to `{moodleUrl}/login` + hint to refresh after login              |
| 4c    | Logged in                                            | Existing `<MoodleSyncDialog>` opens — Level 5                                                                  |
| 5     | Sync dialog (unchanged)                              | Existing `scraping → comparing → select-courses → scraping-content → select-content → syncing → done           | error` flow |

**No re-check / re-detect buttons anywhere.** Detection runs on mount; users refresh the page after installing the extension or logging into Moodle. This is a deliberate simplification (less state, fewer affordances to test).

## Manifest changes (CWS readiness)

`extension/manifest.json`:

- Move `"host_permissions": ["<all_urls>"]` → `"optional_host_permissions": ["<all_urls>"]`. This is the single most important change for review approval.
- Keep `permissions: ["storage", "scripting", "cookies", "tabs", "activeTab"]`. Each is justified by code already in the repo:
  - `cookies` — `MoodleSession` quick-check at `extension/src/background/service-worker.ts:223`.
  - `scripting` — content-script injection via `chrome.scripting.executeScript`.
  - `tabs` — `getOrCreateMoodleTab` (background tab lifecycle).
  - `storage` — extension preferences.
  - `activeTab` — `executeScript` permission on the user-activated tab.
- Bump manifest `version` to `0.2.0` (the permission-model change is a breaking API contract).

### Behavior change

After the user enters their Moodle URL in `<MoodleConnectionSetup>`, the component calls `requestPermission(origin)` from `useMoodleExtension` immediately. Chrome displays its native permission dialog asking for access to `https://{domain}/*`.

- If the user declines → save is blocked, toast explains why, button re-enables.
- If the user accepts → connection saves, user proceeds to sync.

This is the only meaningful UX addition in the connection setup flow.

## Error handling

Four classes, mapped to where they fire in code today vs. what changes.

### A. Detection failures (Level 2)

| Failure                              | Cause                                                              | UX                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_EXTENSION_ID` missing   | env var not loaded                                                 | Dev: `console.warn` so it's obvious. Prod: silently treated as `not-installed` (users never hit it) |
| Extension not installed              | `chrome.runtime.lastError` set with "Receiving end does not exist" | `not-installed` card                                                                                |
| Extension installed but unresponsive | Promise hangs                                                      | 2-second timeout → `not-installed` (logged)                                                         |
| Malformed PING response              | `success !== true` or missing `data.version`                       | `not-installed` (logged)                                                                            |

### B. Permission failures (Level 3)

| Failure                                                   | Symptom                                                                      | UX                                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| User declines Chrome permission prompt                    | Service worker returns `{ success: false, error: "User denied permission" }` | Banner stays; toast: "Permission required to sync with {domain}"; button re-enables                                              |
| User revokes permission later (via `chrome://extensions`) | Next scrape call fails with permission error inside `executeScript`          | `<MoodleSyncDialog>` catches it → inline "Grant Permission" fallback button reruns `requestPermission` and retries the operation |
| Invalid origin string                                     | Service worker `catch` returns `{ success: false, error: String(err) }`      | Toast surfaces the message                                                                                                       |

### C. Moodle login & scrape failures (Levels 4–5)

The existing `isAuthError` regex at `moodle-sync-dialog.tsx:67` (matches `403`, `forbidden`, `unauthorized`, `login required`, `session expired`) stays untouched. Two additions:

1. **New `isNetworkError` helper, parallel to `isAuthError`** — matches `network`, `fetch`, `timeout` in the error message. When it fires (and `isAuthError` does not), surface: "Couldn't reach `{domain}`. Check your internet and try again." Keeping these as two separate functions matters: a network failure and an auth failure want different recovery affordances, and conflating them would muddy both the error display logic and any future telemetry.
2. **Debug payload UX** — the raw debug object surfaced at `moodle-sync-dialog.tsx:295` ("Page: '…' at … (N cards)") is useful for development but ugly for users. Wrap it in a `<details><summary>Debug info</summary>…</details>` so it stays available without dominating the alert.

### D. Download/upload failures (mid-sync)

Existing per-file error collection at `moodle-sync-dialog.tsx:539` (first 3 errors shown on the "done with errors" screen) stays. One addition:

- **"Retry failed (N)" button** on the `done` screen when `failedCount > 0`. Re-runs only the failed jobs (kept in state as `failedJobs: typeof fileJobs`). On retry, the counts update in place; if retry succeeds, the card flips to a clean success state.

Persistent per-file error logs (so users see _what_ failed after closing the dialog) are deferred.

## Verification strategy

Three layers, matching the user's choice of "unit tests + one Playwright gating test + manual checklist".

### Automated — runs in CI

**Vitest** (new and extended):

- `src/hooks/use-extension-platform.test.ts` — table-driven, stubs `window.chrome` and `matchMedia('(pointer: fine)')`. Covers: Chromium-desktop, Firefox-desktop, Safari-desktop, iPad-Chrome, Android-Chrome.
- `src/components/dashboard/extension-gate.test.tsx` — renders children only when supported; otherwise returns `null`.
- `src/hooks/use-moodle-extension.test.ts` (extend) — adds: 2 s timeout fires, version-mismatch path, malformed-response path.

**Playwright** (one new spec, `e2e/moodle-touch-gating.spec.ts`):

1. Log in with the shared helper from `e2e/helpers/auth.ts`.
2. Set viewport to Playwright's iPad device descriptor (touch + coarse pointer).
3. Assert the Moodle card is not visible.
4. Reset viewport to desktop.
5. Assert the Moodle card IS visible in some state (the install card is fine — we're testing the gate, not the contents).

This is registered in `e2e/TEST_REGISTRY.md` per CLAUDE.md requirement.

### Semi-automated — local smoke (`extension/QUICKSTART.md`)

A 10-step build → load → connect → sync flow, each step paired with an expected outcome. Anyone (you, future contributors) should be able to follow it in under 10 minutes and either confirm "✅ works" or land on a specific step that broke.

### Manual — requires real Moodle credentials

Three pre-release flows captured in the same `extension/QUICKSTART.md` under a "Before release" section:

1. **Auth expiry mid-sync** — start a sync; log out of Moodle in another tab; confirm the error path triggers `isAuthError` and shows the "Re-log into Moodle" affordance.
2. **Permission revocation** — start a sync; revoke at `chrome://extensions`; confirm the "Grant Permission" fallback fires.
3. **Large course** — sync a course with 20+ files. Confirm download progress, confirm files appear in Supabase Storage, confirm "Retry failed" works if a file flakes.

These cannot be automated without real credentials; documenting them keeps them from being forgotten.

## Files touched

**New:**

- `src/hooks/use-extension-platform.ts`
- `src/hooks/use-extension-platform.test.ts`
- `src/components/dashboard/extension-gate.tsx`
- `src/components/dashboard/extension-gate.test.tsx`
- `src/components/dashboard/moodle-card-skeleton.tsx`
- `e2e/moodle-touch-gating.spec.ts`
- `extension/QUICKSTART.md`

**Modified:**

- `extension/manifest.json` — permission model + version bump
- `extension/package.json` — version bump
- `src/hooks/use-moodle-extension.ts` — state machine + timeout + version check
- `src/hooks/use-moodle-extension.test.ts` — extended cases
- `src/components/dashboard/moodle-sync-prompt-wrapper.tsx` — wrap with `<ExtensionGate>`; branch on state
- `src/components/dashboard/moodle-sync-prompt.tsx` — receive state via props; render install/update card
- `src/components/dashboard/moodle-connection-setup.tsx` — call `requestPermission()` after URL save; show permission banner
- `src/components/dashboard/moodle-sync-dialog.tsx` — add network-error message; wrap debug payload in `<details>`; add "Retry failed" button + state; add "Grant Permission" fallback
- `.env.local.example` — add `NEXT_PUBLIC_EXTENSION_ID` with explanatory comment
- `e2e/TEST_REGISTRY.md` — register new gating spec
- `CLAUDE.md` — append "Active Technologies" line for this spec

## Open questions for plan / implementation

- Naming: `<ExtensionGate>` is generic. If we add other Chromium-only features later (e.g., a Drive extension), the name is right; if not, `<MoodleGate>` is more honest. Default to `<ExtensionGate>` for forward-compat.
- `EXPECTED_EXTENSION_VERSION` exact-match vs. minimum: starting with exact-match; can swap to semver comparison when we ship anything beyond `0.2.0`.
