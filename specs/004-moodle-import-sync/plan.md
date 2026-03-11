# Implementation Plan: Moodle Import & Sync

**Branch**: `004-moodle-import-sync` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-moodle-import-sync/spec.md`

## Summary

Build a Chrome extension + backend system that lets students import Moodle course materials into Typenote. The extension scrapes Moodle using the student's existing browser session (no credentials shared with server). Materials are stored once in a shared registry and deduplicated by URL + content hash. The sync flow is driven entirely from the Typenote web app, with the extension acting as "hands" that reach into Moodle. Students choose exactly what to import at a granular level (per-file, per-link).

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 18+ (web app + extension)
**Primary Dependencies**: Next.js 16 (App Router), @supabase/ssr, Chrome Extension Manifest V3
**Storage**: PostgreSQL via Supabase (shared registry tables) + Supabase Storage (deduped files)
**Testing**: Vitest (unit/integration), Playwright (e2e), manual extension testing
**Target Platform**: Web (Next.js) + Chrome/Chromium browsers (extension)
**Project Type**: Web application + browser extension (monorepo)
**Performance Goals**: Re-sync detection < 30s (excluding downloads), file dedup check < 1s
**Constraints**: Online-only, Moodle session never leaves browser, Chrome-first MVP
**Scale/Scope**: MVP targeting students at a handful of universities, ~100s of courses

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Incremental Development | PASS | Plan starts with DB schema (shared registry), then API, then extension, then UI. Each phase produces testable increment. |
| II. Test-Driven Quality | PASS | Integration tests for new DB tables/RLS, unit tests for dedup logic and sync service, e2e for import flow. Extension tested manually + with mocked responses. |
| III. Protected Main Branch | PASS | Work on `004-moodle-import-sync` branch, PR to main when ready. |
| IV. Migrations as Code | PASS | New shared tables via `supabase migration new`. RLS policies for shared read access. `supabase db reset` to verify. |
| V. Interview-Ready Architecture | PASS | Shared vs per-user data model, content-addressable dedup, extension security model — all strong interview topics. |

## Project Structure

### Documentation (this feature)

```text
specs/004-moodle-import-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Next.js app (existing structure, new additions marked with +)
src/
├── app/
│   └── api/
│       └── moodle/                    # + New API routes
│           ├── sync/route.ts          # + Receive scraped course data, upsert shared registry
│           ├── upload/route.ts        # + Receive file uploads, dedup + store
│           └── status/route.ts        # + Check sync status for a course
├── components/
│   └── dashboard/
│       ├── moodle-sync-dialog.tsx     # + Sync flow UI (course list, file picker)
│       ├── moodle-sync-prompt.tsx     # + Login detection prompt
│       └── moodle-connection-setup.tsx # + Settings: enter Moodle URL
├── hooks/
│   └── use-moodle-extension.ts        # + Hook for extension communication
├── lib/
│   ├── actions/
│   │   └── moodle-sync.ts            # + Server actions for sync operations
│   ├── queries/
│   │   └── moodle.ts                 # + Queries for shared registry + user syncs
│   └── moodle/
│       ├── dedup.ts                   # + Deduplication logic (URL + hash)
│       └── types.ts                   # + Moodle-specific types
└── types/
    └── database.ts                    # + Add shared registry types

# Chrome Extension (new top-level directory)
extension/
├── manifest.json                      # Manifest V3 config
├── src/
│   ├── background/
│   │   └── service-worker.ts          # Background: login check, message routing
│   ├── content/
│   │   └── moodle-scraper.ts          # Content script: DOM scraping logic
│   ├── lib/
│   │   ├── messaging.ts               # Extension <-> web app message protocol
│   │   ├── file-downloader.ts         # Download files from Moodle, upload to API
│   │   └── moodle-detector.ts         # Validate Moodle URL, detect login status
│   └── types/
│       └── messages.ts                # Shared message type definitions
├── tsconfig.json
└── package.json

# Database
supabase/
└── migrations/
    ├── 00007_create_moodle_shared_registry.sql   # + Shared tables
    └── 00008_create_moodle_user_syncs.sql        # + Per-user sync tracking
```

**Structure Decision**: The extension lives in a separate `extension/` directory at the repo root with its own `package.json` (monorepo style). It shares TypeScript types with the main app where possible but builds independently. The Next.js app gains new API routes under `src/app/api/moodle/` and new components under `src/components/dashboard/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Separate extension project | Chrome extensions require their own build pipeline and manifest | Cannot be part of Next.js build; must be a separate artifact |
| Shared + per-user DB tables | Core requirement: dedup across students while tracking individual imports | Single-user tables would duplicate all storage per student |
