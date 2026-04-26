# Tasks: Fix PDF Export Page Deletion

**Input**: Design documents from `/specs/039-fix-pdf-export-page-loss/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Tests are REQUIRED per CLAUDE.md and spec (user explicitly requested E2E test).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No setup needed — all infrastructure exists. Branch already created.

_(No tasks — existing project, existing files)_

---

## Phase 2: User Story 1 — Pages with non-text content survive auto-save (Priority: P1) 🎯 MVP

**Goal**: Fix `pageHasContent()` so math/LaTeX nodes are recognized as real content, preventing silent page stripping during auto-save.

**Independent Test**: Create a page with only math content, auto-save, verify the page survives.

### Tests for User Story 1

- [x] T001 [P] [US1] Add unit test: math-only ftb text box is detected as content in `src/components/canvas/__tests__/page-utils.test.ts`
- [x] T002 [P] [US1] Add unit test: math-only flowContent is detected as content in `src/components/canvas/__tests__/page-utils.test.ts`
- [x] T003 [P] [US1] Add unit test: `stripTrailingEmptyPages` preserves math-only trailing pages in `src/components/canvas/__tests__/page-utils.test.ts`

### Implementation for User Story 1

- [x] T004 [US1] Fix `pageHasContent()` to recognize `"mathExpression"` nodes in `-ftb` text box content check (line 22) in `src/components/canvas/page-utils.ts`
- [x] T005 [US1] Fix `pageHasContent()` to recognize `"mathExpression"` nodes in flowContent check (line 28) in `src/components/canvas/page-utils.ts`

**Checkpoint**: Math-only pages are no longer stripped by auto-save. Unit tests pass.

---

## Phase 3: User Story 2 — Pages persist after PDF export (Priority: P1)

**Goal**: Add a page-count guard in `onRemotePagesUpdate` to prevent the echo guard race condition from overwriting local state with fewer pages.

**Independent Test**: Verify that `onRemotePagesUpdate` rejects remote pages when they have fewer pages than local state.

### Tests for User Story 2

- [x] T006 [US2] Add unit test: `onRemotePagesUpdate` rejects remote update with fewer pages than local in `src/components/canvas/__tests__/canvas-editor-undo-export.test.ts`

### Implementation for User Story 2

- [x] T007 [US2] Add page-count guard in `onRemotePagesUpdate` — skip `setPages` when remote has fewer pages than `pagesRef.current` in `src/components/canvas/canvas-editor.tsx`

**Checkpoint**: Echo guard race condition cannot overwrite local state with stripped pages. Unit tests pass.

---

## Phase 4: User Story 3 — E2E browser test validates page persistence after export (Priority: P1)

**Goal**: Create a Playwright E2E test that creates 6 pages of content, exports to PDF, waits, and verifies all pages remain.

**Independent Test**: Run the Playwright test — it must pass in CI.

### Implementation for User Story 3

- [x] T008 [US3] Create E2E test file `e2e/export-pdf-page-persistence.spec.ts` — log in, create canvas document, type content on 6 pages, click export, wait 60s, verify all 6 pages present
- [x] T009 [US3] Update `e2e/TEST_REGISTRY.md` with new test scenarios for page persistence after PDF export

**Checkpoint**: E2E test passes locally with `pnpm test:e2e`.

---

## Phase 5: Polish & Validation

**Purpose**: Run full test suite, verify no regressions.

- [x] T010 Run `pnpm test` — all unit tests pass
- [x] T011 Run `pnpm test:e2e` — all E2E tests pass (including the new one)

---

## Dependencies & Execution Order

### Phase Dependencies

- **US1 (Phase 2)**: No dependencies — can start immediately
- **US2 (Phase 3)**: Independent of US1 — can run in parallel
- **US3 (Phase 4)**: Depends on US1 and US2 being complete (the E2E test verifies the fixes)
- **Polish (Phase 5)**: Depends on all user stories being complete

### Parallel Opportunities

- T001, T002, T003 can run in parallel (same file, but independent test cases)
- T004, T005 are sequential (same function, same file)
- US1 and US2 can run in parallel (different files)
- T010, T011 are sequential (run unit first, then E2E)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T005 (fix `pageHasContent` + unit tests)
2. **STOP and VALIDATE**: `pnpm test` passes
3. This alone fixes the core data-loss bug

### Full Delivery

1. US1: Fix content detection (T001-T005)
2. US2: Add page-count guard (T006-T007)
3. US3: E2E test (T008-T009)
4. Polish: Full validation (T010-T011)

---

## Notes

- Total tasks: 11
- US1: 5 tasks (core bug fix)
- US2: 2 tasks (race condition guard)
- US3: 2 tasks (E2E test)
- Polish: 2 tasks (validation)
- No new dependencies needed
- No database changes
