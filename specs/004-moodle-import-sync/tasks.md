# Tasks: Moodle Import & Sync

**Input**: Design documents from `/specs/004-moodle-import-sync/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Included per constitution (Test-Driven Quality principle). Integration tests for DB/RLS, unit tests for dedup logic, manual testing for extension.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extension project scaffold and shared types between app and extension

- [x] T001 Create extension project structure at `extension/` with `package.json`, `tsconfig.json`, and build config (esbuild or vite for bundling)
- [x] T002 Create extension `extension/manifest.json` with Manifest V3: `externally_connectable` for Typenote domain, `optional_host_permissions`, `storage` permission, service worker registration
- [x] T003 [P] Create shared message types at `extension/src/types/messages.ts` matching the extension-messaging contract (PING, CHECK_LOGIN, SCRAPE_COURSES, SCRAPE_COURSE_CONTENT, DOWNLOAD_AND_UPLOAD, REQUEST_PERMISSION)
- [x] T004 [P] Create Moodle-specific TypeScript types at `src/lib/moodle/types.ts` for shared registry entities (MoodleInstance, MoodleCourse, MoodleSection, MoodleFile) and sync payloads matching API contracts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, storage bucket, and core infrastructure that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create migration `supabase/migrations/00007_create_moodle_shared_registry.sql` — `moodle_instances`, `moodle_courses`, `moodle_sections`, `moodle_files` tables with indexes, unique constraints, updated_at triggers, and RLS (SELECT for authenticated, no direct INSERT/UPDATE/DELETE)
- [x] T006 Create migration `supabase/migrations/00008_create_moodle_user_syncs.sql` — `user_moodle_connections`, `user_course_syncs`, `user_file_imports` tables with user_id-based RLS, indexes, unique constraints, updated_at triggers
- [x] T007 Create migration `supabase/migrations/00009_create_moodle_storage_bucket.sql` — `moodle-materials` shared storage bucket with expanded MIME types, SELECT for authenticated, INSERT/UPDATE/DELETE via service role
- [x] T008 Run `supabase db reset` to verify full migration chain replays cleanly
- [x] T009 Add new entity types to `src/types/database.ts` — MoodleInstance, MoodleCourse, MoodleSection, MoodleFile, UserMoodleConnection, UserCourseSync, UserFileImport
- [x] T010 Update `supabase/seed.sql` with sample Moodle data (test instance, courses, sections, files) for local development
- [x] T011 Write integration test for shared registry RLS in `src/lib/queries/moodle-registry.integration.test.ts` — verify authenticated users can SELECT shared tables, verify direct INSERT is blocked, verify service role can INSERT
- [x] T012 Write integration test for per-user sync RLS in `src/lib/queries/moodle-user-syncs.integration.test.ts` — verify users can only CRUD their own connections/syncs/imports

**Checkpoint**: Database ready — all 7 new tables created, RLS verified, seed data available

---

## Phase 3: User Story 1 — Shared Moodle Registry & Deduplication (Priority: P1) MVP

**Goal**: Backend services that upsert shared Moodle data and deduplicate files by URL + content hash. This is the data backbone all other stories depend on.

**Independent Test**: Two students sync the same course → only one shared entity exists, files stored once, second student gets references.

### Tests for User Story 1

- [x] T013 [P] [US1] Write unit test for dedup logic in `src/lib/moodle/dedup.test.ts` — test URL match, hash match, new file, modified file (same URL different hash), and cross-course hash dedup scenarios
- [x] T014 [P] [US1] Write integration test for sync API in `src/lib/moodle/sync-service.integration.test.ts` — test upsert of instances/courses/sections/files, verify idempotent upserts, verify concurrent sync safety

### Implementation for User Story 1

- [x] T015 [P] [US1] Implement dedup service in `src/lib/moodle/dedup.ts` — `checkFileExists(sectionId, moodleUrl, contentHash)` returning `{ exists: boolean, fileId?: string, status: 'exists' | 'new' | 'modified' }`
- [x] T016 [P] [US1] Implement shared registry queries in `src/lib/queries/moodle.ts` — `getMoodleInstance(domain)`, `getMoodleCourse(instanceId, moodleCourseId)`, `getMoodleSections(courseId)`, `getMoodleFiles(sectionId)`
- [x] T017 [US1] Implement sync service in `src/lib/moodle/sync-service.ts` — `upsertMoodleData(payload)` that takes scraped course data, upserts into shared tables using service role, returns status per file (exists/new/modified)
- [x] T018 [US1] Create API route `src/app/api/moodle/sync/route.ts` (POST) — receives scraped course data, calls sync service, returns registry comparison result per the api-routes contract
- [x] T019 [US1] Create API route `src/app/api/moodle/upload/route.ts` (POST) — receives multipart file upload + metadata, runs dedup check, stores in `moodle-materials` bucket if new, creates/updates `moodle_files` record
- [x] T020 [US1] Run all tests (`pnpm test` + `pnpm test:integration`) to verify dedup and sync logic

**Checkpoint**: Shared registry and dedup fully functional. API routes accept course data and file uploads. Files are deduplicated.

---

## Phase 4: User Story 2 — First-Time Moodle Connection Setup (Priority: P1)

**Goal**: Student can install extension, enter their Moodle URL in Typenote settings, and establish a connection. App can detect if extension is installed.

**Independent Test**: Enter a Moodle URL → system validates and saves connection. Extension responds to PING.

### Implementation for User Story 2

- [x] T021 [P] [US2] Implement extension service worker at `extension/src/background/service-worker.ts` — listen for `onMessageExternal`, handle PING message (return version), route other messages
- [x] T022 [P] [US2] Implement Moodle detector at `extension/src/lib/moodle-detector.ts` — `validateMoodleUrl(url)` that makes a fetch to the URL and checks for Moodle page markers
- [x] T023 [P] [US2] Implement permission requester in `extension/src/lib/messaging.ts` — handle REQUEST_PERMISSION message, call `chrome.permissions.request()` for the Moodle domain
- [x] T024 [US2] Implement `use-moodle-extension` hook at `src/hooks/use-moodle-extension.ts` — `ping()` to detect extension, `requestPermission(url)`, `isExtensionInstalled` state. Uses `chrome.runtime.sendMessage` with extension ID from env
- [x] T025 [US2] Create Moodle connection setup component at `src/components/dashboard/moodle-connection-setup.tsx` — URL input field, validation feedback, save button. Shows "Extension not installed" prompt if ping fails
- [x] T026 [US2] Implement server action `src/lib/actions/moodle-sync.ts` — `saveMoodleConnection(domain)` that upserts `moodle_instances` (via service role) and creates `user_moodle_connections` record
- [x] T027 [US2] Implement query `src/lib/queries/moodle.ts` — add `getUserMoodleConnection(userId)` to fetch user's connected instance
- [x] T028 [US2] Add connection setup to dashboard settings page or onboarding flow — integrate the component where students configure their Moodle URL
- [x] T029 [US2] Write unit test for `use-moodle-extension` hook in `src/hooks/use-moodle-extension.test.ts` — test ping success/failure, extension detection

**Checkpoint**: Student can enter Moodle URL, it validates, connection is saved. Extension responds to ping.

---

## Phase 5: User Story 3 — Moodle Login Detection & Sync Prompt (Priority: P1)

**Goal**: App automatically detects Moodle login status via extension and shows appropriate prompt (sync or login).

**Independent Test**: Open Typenote while logged into Moodle → see sync prompt. Open while logged out → see login prompt.

### Implementation for User Story 3

- [x] T030 [P] [US3] Implement CHECK_LOGIN handler in extension service worker `extension/src/background/service-worker.ts` — fetch Moodle dashboard URL, check if response is login page or logged-in content
- [x] T031 [US3] Add `checkMoodleLogin(moodleUrl)` to `src/hooks/use-moodle-extension.ts` — sends CHECK_LOGIN message, returns `{ loggedIn: boolean }`
- [x] T032 [US3] Create sync prompt component at `src/components/dashboard/moodle-sync-prompt.tsx` — shows "Sync with Moodle" button if logged in, "Log into Moodle" with link if not, "Install extension" if missing
- [x] T033 [US3] Integrate sync prompt into dashboard layout `src/app/(dashboard)/layout.tsx` or dashboard page — check login status on mount, show prompt accordingly

**Checkpoint**: Login detection works. Dashboard shows contextual Moodle prompt.

---

## Phase 6: User Story 4 — Course Discovery & Sync Against Shared Registry (Priority: P1)

**Goal**: Extension scrapes Moodle course list, app compares against shared registry, student sees courses with sync status (new, already synced, new items available).

**Independent Test**: Trigger sync → see course list from Moodle → courses already in registry show as "synced" with new item count.

### Implementation for User Story 4

- [x] T034 [P] [US4] Implement SCRAPE_COURSES handler in extension — inject content script or fetch Moodle dashboard, extract enrolled course list (id, name, url) from DOM. Implement in `extension/src/content/moodle-scraper.ts` and wire to service worker
- [x] T035 [US4] Add `scrapeCourses(moodleUrl)` to `src/hooks/use-moodle-extension.ts` — sends SCRAPE_COURSES message, returns course list
- [x] T036 [US4] Implement course comparison logic in `src/lib/moodle/sync-service.ts` — `compareCourses(instanceDomain, scrapedCourses)` that checks shared registry and returns status per course (new_to_system, synced_by_others, synced_by_user, has_new_items)
- [x] T037 [US4] Create sync dialog component at `src/components/dashboard/moodle-sync-dialog.tsx` — modal showing course list with checkboxes, sync status indicators, "Sync Selected" button
- [x] T038 [US4] Implement server action in `src/lib/actions/moodle-sync.ts` — `syncCourses(instanceDomain, courses)` that calls the /api/moodle/sync route and creates/updates `user_course_syncs` records
- [x] T039 [US4] Add query to `src/lib/queries/moodle.ts` — `getUserCourseSyncs(userId)` to fetch all synced courses with last sync timestamps
- [x] T040 [US4] Wire sync dialog to the sync prompt button from US3 — clicking "Sync with Moodle" opens the dialog, triggers course scraping

**Checkpoint**: Students can see their Moodle courses, compare against shared registry, and select courses for sync.

---

## Phase 7: User Story 5 — Granular Material Selection & Import (Priority: P1)

**Goal**: After selecting a course, student sees sections and files, cherry-picks items, extension downloads new files and uploads them. Already-existing files create references instantly.

**Independent Test**: Expand a course → see sections/files → select items → import completes with dedup.

### Implementation for User Story 5

- [x] T041 [P] [US5] Implement SCRAPE_COURSE_CONTENT handler in extension — fetch individual course page, extract sections with titles/order and items (files + links) with metadata. Add to `extension/src/content/moodle-scraper.ts`
- [x] T042 [P] [US5] Implement DOWNLOAD_AND_UPLOAD handler in extension at `extension/src/lib/file-downloader.ts` — download file blob from Moodle URL, compute SHA-256 hash, upload to Typenote API endpoint as multipart form
- [x] T043 [US5] Add `scrapeCourseContent(courseUrl)` and `downloadAndUpload(params)` to `src/hooks/use-moodle-extension.ts`
- [x] T044 [US5] Create file picker UI within `src/components/dashboard/moodle-sync-dialog.tsx` — expandable sections with checkboxes per item, file type icons, size display, "Already imported" badges
- [x] T045 [US5] Create API route `src/app/api/moodle/import/route.ts` (POST) — receives list of moodle_file IDs, creates `user_file_imports` records, updates `user_course_syncs.last_synced_at`
- [x] T046 [US5] Create API route `src/app/api/moodle/status/route.ts` (GET) — returns what this student has already imported for a course (imported file IDs, removed file IDs)
- [x] T047 [US5] Implement import orchestration in `src/lib/actions/moodle-sync.ts` — `importSelectedFiles(syncId, fileIds, newFiles)` that: (a) calls extension to download/upload truly new files, (b) creates references for existing files, (c) records all imports via /api/moodle/import
- [x] T048 [US5] Integrate file picker with import orchestration — wire "Import Selected" button to download, upload, and record flow with progress indicators
- [x] T049 [US5] Run full test suite and manually test the complete flow: scrape → pick → download → dedup → import

**Checkpoint**: Full import pipeline works. Students can cherry-pick files, dedup works, files land in storage.

---

## Phase 8: User Story 6 — Re-Sync & Change Detection (Priority: P2)

**Goal**: When re-syncing, only new/changed items are shown. Removed files are flagged. Modified files are replaced.

**Independent Test**: Add/remove/modify files on Moodle, re-sync → correct detection of each change type.

### Tests for User Story 6

- [x] T050 [P] [US6] Write unit test for change detection logic in `src/lib/moodle/sync-service.test.ts` — test scenarios: new file detected, file removed from Moodle, file modified (same URL different hash), no changes

### Implementation for User Story 6

- [x] T051 [US6] Implement change detection in `src/lib/moodle/sync-service.ts` — `detectChanges(courseId, scrapedSections)` that compares current Moodle state against shared registry and returns `{ newFiles, removedFiles, modifiedFiles }`
- [x] T052 [US6] Implement removed file flagging — when a file in the registry is no longer in scraped data, set `moodle_files.is_removed = true` and update `user_file_imports.status = 'removed_from_moodle'` for all users who imported it
- [x] T053 [US6] Implement modified file replacement — when same URL has different content hash, upload new version to storage, update `moodle_files` record (content_hash, storage_path), delete old storage object
- [x] T054 [US6] Update sync dialog UI to show change indicators — "New" badges on new items, "Removed from Moodle" labels on removed items, filter to show only actionable items by default
- [x] T055 [US6] Run all tests and verify re-sync scenarios end-to-end

**Checkpoint**: Re-sync correctly detects all change types. Removed files flagged, modified files replaced.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, and production readiness

- [x] T056 [P] Handle extension not installed — show install prompt with link in sync prompt component `src/components/dashboard/moodle-sync-prompt.tsx`
- [x] T057 [P] Handle session expiry mid-sync — detect auth errors from extension, pause sync, show re-login prompt, resume after re-auth
- [x] T058 [P] Handle file download failures — mark failed items with retry option in sync dialog, continue other items
- [x] T059 [P] Handle file size limit — flag files > 50MB as "Too large" in file picker, prevent selection
- [x] T060 Add loading states and progress indicators throughout sync flow (course scraping, file downloading, upload progress)
- [x] T061 Implement linking synced Moodle course to personal Typenote course — add optional `course_id` selection in sync dialog, update `user_course_syncs.course_id`
- [x] T062 Run full lint, format check, and test suite (`pnpm lint && pnpm format:check && pnpm test && pnpm test:integration`)
- [x] T063 Run quickstart.md validation — verify dev setup flow works end to end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — BLOCKS US4, US5, US6 (they need registry + dedup)
- **US2 (Phase 4)**: Depends on Foundational — can run in parallel with US1
- **US3 (Phase 5)**: Depends on US2 (needs extension + connection setup)
- **US4 (Phase 6)**: Depends on US1 (needs shared registry) + US3 (needs login detection + sync prompt)
- **US5 (Phase 7)**: Depends on US4 (needs course discovery) + US1 (needs dedup/upload)
- **US6 (Phase 8)**: Depends on US5 (needs full import pipeline to be working)
- **Polish (Phase 9)**: Depends on all stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    │
Phase 2 (Foundational / DB)
    │
    ├── US1 (Shared Registry & Dedup) ──┐
    │                                    │
    ├── US2 (Connection Setup) ──┐       │
    │                            │       │
    │                    US3 (Login Detection)
    │                            │       │
    │                            └── US4 (Course Discovery) ◄──┘
    │                                    │
    │                               US5 (Granular Import)
    │                                    │
    │                               US6 (Re-Sync & Change Detection)
    │
Phase 9 (Polish)
```

### Within Each User Story

- Tests written and verified to FAIL before implementation
- Models/types before services
- Services before API routes
- API routes before UI components
- Integration before moving to next story

### Parallel Opportunities

- **Phase 1**: T003 and T004 can run in parallel (different files)
- **Phase 2**: T005, T006, T007 can potentially run in parallel (different migration files), but must be sequenced for `supabase db reset`
- **Phase 3**: T013 + T014 tests in parallel; T015 + T016 in parallel
- **Phase 4**: T021, T022, T023 in parallel (different extension files)
- **US1 and US2** can run in parallel after Phase 2 (different files entirely — backend API vs extension scaffold)
- **Phase 9**: T056, T057, T058, T059 all in parallel (different components/concerns)

---

## Parallel Example: Phase 3 (US1) + Phase 4 (US2)

```
# After Phase 2 completes, launch in parallel:

Agent 1 (US1 - Backend):                    Agent 2 (US2 - Extension):
  T013 dedup unit tests                       T021 service worker
  T014 sync integration tests                 T022 moodle detector
  T015 dedup service                          T023 permission requester
  T016 registry queries                       T024 use-moodle-extension hook
  T017 sync service                           T025 connection setup component
  T018 sync API route                         T026 saveMoodleConnection action
  T019 upload API route                       T027 getUserMoodleConnection query
  T020 run tests                              T028 integrate into settings page
                                              T029 hook unit test
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup — extension scaffold
2. Complete Phase 2: Foundational — DB schema, storage bucket, types
3. Complete Phase 3: US1 — shared registry + dedup (backend-only, can test via API)
4. Complete Phase 4: US2 — extension connection setup
5. Complete Phase 5: US3 — login detection
6. **STOP and VALIDATE**: Extension communicates with app, connection saved, login detected

### Incremental Delivery

1. Setup + Foundational → DB ready
2. US1 → Shared registry works (backend testable)
3. US2 → Extension installed, Moodle connected
4. US3 → Login detection works
5. US4 → Can browse Moodle courses from Typenote
6. US5 → Full import pipeline (CORE FEATURE COMPLETE)
7. US6 → Re-sync with change detection
8. Polish → Production-ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Extension scraping logic (T034, T041) will be refined using browser-use tooling — implement placeholder selectors first, then iterate with real Moodle instances
- Moodle DOM patterns are intentionally not specified — they'll be discovered during implementation
- The extension builds separately from Next.js — it has its own tsconfig and build pipeline
- Service role key is required for shared table writes — never expose to client
