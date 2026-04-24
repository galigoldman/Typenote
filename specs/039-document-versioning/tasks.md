# Tasks: Document Version History

**Input**: Design documents from `/specs/039-document-versioning/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — CLAUDE.md requires unit, integration, and E2E tests for every feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Database & Types)

**Purpose**: Create the database schema, RPC functions, and TypeScript types that all stories depend on.

- [x] T001 Create migration file with `document_versions` table, indexes, RLS policies, `create_document_version` RPC, and `restore_document_version` RPC in supabase/migrations/20260413101143_create_document_versions.sql
- [x] T002 Add sample version records for the test document in supabase/seed.sql
- [x] T003 Run `supabase db reset` to verify migration chain replays cleanly
- [x] T004 Add `DocumentVersion` interface and `VersionTrigger` type to src/types/database.ts

---

## Phase 2: Foundational (Server Actions & Queries)

**Purpose**: Core server-side infrastructure that MUST be complete before ANY user story UI can be built.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 [P] Create `createVersionSnapshot` server action in src/lib/actions/document-versions.ts — calls `create_document_version` RPC with document's current content/pages/title
- [x] T006 [P] Create `getDocumentVersions` query function in src/lib/queries/document-versions.ts — fetches versions for a document ordered by created_at DESC
- [x] T007 [P] Create `restoreDocumentVersion` server action in src/lib/actions/document-versions.ts — calls `restore_document_version` RPC
- [x] T008 [P] Create beacon endpoint POST handler in src/app/api/version-snapshot/route.ts — authenticates via Supabase cookie, calls `create_document_version` RPC with trigger='close', returns 204
- [x] T009 Write integration tests for `create_document_version` RPC (insert, cap enforcement at 8, duplicate prevention) in src/lib/actions/**tests**/document-versions.integration.test.ts
- [x] T010 Write integration tests for `restore_document_version` RPC (before_restore snapshot creation, document overwrite, cap enforcement) in src/lib/actions/**tests**/document-versions.integration.test.ts

**Checkpoint**: Foundation ready — all server-side endpoints and queries work and are tested. User story implementation can now begin.

---

## Phase 3: User Story 1 — View Version History (Priority: P1) MVP

**Goal**: Users can open a sidebar to see a chronological list of saved version snapshots with relative timestamps and trigger labels.

**Independent Test**: Open sidebar on a document with saved versions → see entries ordered newest-first with correct timestamps and labels. Empty state shown when no versions exist.

### Tests for User Story 1

- [x] T011 [P] [US1] Write unit test for relative timestamp formatting (e.g., "30 min ago", "2 hours ago", "Yesterday") in src/components/version-history/**tests**/version-sidebar.test.tsx

### Implementation for User Story 1

- [x] T012 [P] [US1] Create `VersionSidebar` component in src/components/version-history/version-sidebar.tsx — fetches versions via `fetchDocumentVersions`, renders newest-first list with relative timestamps and trigger labels, shows empty state when no versions
- [x] T013 [US1] Add version history toggle button and sidebar integration to src/components/canvas/canvas-editor.tsx — toggle button in toolbar opens/closes `VersionSidebar` alongside the editor (follows AI Chat Panel layout pattern)
- [x] T014 [US1] Add version history toggle button and sidebar integration to src/components/editor/tiptap-editor.tsx — same toggle for text-only documents via TiptapEditorWithVersions wrapper

**Checkpoint**: User Story 1 is fully functional — users can view version history in a sidebar. The sidebar shows real data from the database (seeded or manually inserted).

---

## Phase 4: User Story 2 — Automatic Version Snapshots (Priority: P1) MVP

**Goal**: The system automatically creates version snapshots at smart intervals (30s idle, 5min periodic, session close) without user action. Duplicate/unchanged snapshots are skipped. Cap of 8 enforced.

**Independent Test**: Edit a document, wait 30 seconds, verify a version appears in the database. Edit more, wait again, verify a second version appears. Verify sidebar (from US1) shows the new entries.

### Tests for User Story 2

- [x] T015 [P] [US2] Write unit tests for `useVersionSnapshots` hook — idle timer fires after 30s, periodic timer fires after 5min, timers reset on activity, skip when content unchanged — in src/hooks/**tests**/use-version-snapshots.test.ts

### Implementation for User Story 2

- [x] T016 [US2] Create `useVersionSnapshots` hook in src/hooks/use-version-snapshots.ts — manages idle timer (30s), periodic timer (5min), change detection via JSON.stringify comparison against last snapshot ref, calls `createVersionSnapshot` server action on trigger
- [x] T017 [US2] Add `beforeunload` and `visibilitychange` handlers to `useVersionSnapshots` for session-close snapshots — uses `navigator.sendBeacon()` to POST to /api/version-snapshot endpoint
- [x] T018 [US2] Wire `useVersionSnapshots` into `useDocumentSync` in src/hooks/use-document-sync.ts — pass documentId, editor content getter, and pages getter; reset idle timer on each `triggerSave` call

**Checkpoint**: User Story 2 is fully functional — versions are created automatically at smart intervals. Combined with US1, users can edit and then see their version history populate in real-time.

---

## Phase 5: User Story 3 — Restore a Previous Version (Priority: P2)

**Goal**: Users can select a version from the sidebar and restore it, overwriting the current document. A "Before restore" safety snapshot is always created first.

**Independent Test**: Edit document to state B, open sidebar showing snapshot of state A, click "Restore" on state A, verify document shows state A content and a new "Before restore" entry appears in the sidebar.

### Tests for User Story 3

- [x] T019 [P] [US3] Write integration test for restore flow — verify document content is overwritten, "before_restore" snapshot is created, sidebar reflects new state — in src/lib/actions/**tests**/document-versions.integration.test.ts

### Implementation for User Story 3

- [x] T020 [US3] Add restore UI to `VersionSidebar` in src/components/version-history/version-sidebar.tsx — click to select a version (highlight), show "Restore" button, call `restoreDocumentVersion` server action
- [x] T021 [US3] Handle restore response in editor — after `restoreDocumentVersion` completes, router.refresh() reloads document content from server, refresh version list in sidebar
- [x] T022 [US3] Wire restore into canvas-editor.tsx and tiptap-editor.tsx — VersionSidebar is mounted in DocumentWithAi and TiptapEditorWithVersions wrappers with onRestore callback

**Checkpoint**: All user stories are independently functional — versions auto-save, display in sidebar, and can be restored with safety snapshots.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, edge case handling, and final validation.

- [x] T023 Update e2e/TEST_REGISTRY.md with version history test scenarios
- [x] T024 Write E2E Playwright test: open document → open version sidebar → verify versions appear in e2e/version-history.spec.ts
- [x] T025 Write E2E Playwright test: restore a version → verify "Before restore" entry appears in e2e/version-history.spec.ts
- [x] T026 Run full test suite: `pnpm test && pnpm test:integration` (E2E deferred to CI)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (needs `getDocumentVersions` query)
- **US2 (Phase 4)**: Depends on Phase 2 (needs `createVersionSnapshot` action)
- **US3 (Phase 5)**: Depends on Phase 2 (needs `restoreDocumentVersion` action) + benefits from US1 sidebar being built
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (View History)**: Can start after Phase 2 — no dependency on other stories
- **US2 (Auto Snapshots)**: Can start after Phase 2 — no dependency on other stories (but complements US1)
- **US3 (Restore)**: Can start after Phase 2 — builds on US1 sidebar component but adds restore functionality

### Within Each User Story

- Tests written before implementation (TDD where practical)
- Core logic before UI wiring
- Commit after each task or logical group

### Parallel Opportunities

- T005, T006, T007, T008 can all run in parallel (different files, no dependencies)
- T009, T010 can run in parallel (different test cases, same file but independent)
- T011, T012 can run in parallel (test + component in different files)
- T015, T016 can run in parallel (test + hook in different files)
- US1 and US2 can be worked on in parallel after Phase 2 (different components/hooks)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all server-side tasks together:
Task: "Create createVersionSnapshot server action in src/lib/actions/document-versions.ts"
Task: "Create getDocumentVersions query in src/lib/queries/document-versions.ts"
Task: "Create restoreDocumentVersion server action in src/lib/actions/document-versions.ts"
Task: "Create beacon endpoint in src/app/api/version-snapshot/route.ts"
```

## Parallel Example: US1 + US2 (after Phase 2)

```bash
# These two stories can run in parallel:
Story 1: "VersionSidebar component + editor integration"
Story 2: "useVersionSnapshots hook + useDocumentSync wiring"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (migration, seed, types)
2. Complete Phase 2: Foundational (server actions, queries, tests)
3. Complete Phase 3: US1 — View Version History
4. Complete Phase 4: US2 — Auto Snapshots
5. **STOP and VALIDATE**: Versions auto-save and display in sidebar
6. Deploy/demo if ready — users get value even without restore

### Incremental Delivery

1. Setup + Foundational → Database ready
2. Add US1 (View History) → Users can see versions → Deploy
3. Add US2 (Auto Snapshots) → Versions populate automatically → Deploy
4. Add US3 (Restore) → Users can restore versions → Deploy
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The migration (T001) includes both RPC functions upfront to avoid a second migration later
- sendBeacon endpoint (T008) is foundational because US2 needs it for session-close triggers
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
