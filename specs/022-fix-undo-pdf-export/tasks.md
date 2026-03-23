# Tasks: Fix Undo Content Persisting in PDF Export

**Input**: Design documents from `/specs/022-fix-undo-pdf-export/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Required by project constitution (Principle II: "When fixing a bug, MUST write a failing test that reproduces the bug first").

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1 and share the same root cause fix, but US1 covers strokes and US2 covers textboxes. US3 (P2) verifies multi-page consistency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this is a bug fix in an existing codebase. Verify existing tests pass before making changes.

- [x] T001 Run existing test suite (`pnpm test`) to confirm baseline passes before any changes
- [x] T002 Run lint (`pnpm lint`) to confirm baseline passes before any changes

**Checkpoint**: Existing tests and lint pass — safe to proceed with changes

---

## Phase 2: Foundational (Core Bug Fix)

**Purpose**: Implement the `saveStatusRef` guard in `onRemotePagesUpdate` — this single change addresses the root cause for all user stories (US1, US2, US3). Must complete before story-specific testing.

**⚠️ CRITICAL**: This phase contains the actual bug fix that all user stories depend on.

- [x] T003 Add `saveStatusRef` ref to track save status in `src/components/canvas/canvas-editor.tsx`. Define `const saveStatusRef = useRef<SaveStatus>('saved')` near the existing refs (around line 444). Add a `useEffect` after `useDocumentSync` returns `saveStatus` to keep it in sync: `useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);`
- [x] T004 Add guard to `onRemotePagesUpdate` callback in `src/components/canvas/canvas-editor.tsx` (lines 473-482). At the start of the callback body, add: `if (saveStatusRef.current === 'unsaved' || saveStatusRef.current === 'saving') { return; }`. This prevents remote updates from overwriting local state when there are pending unsaved changes (including undo).
- [x] T005 Run `pnpm test` and `pnpm lint` to verify the fix doesn't break existing tests or linting

**Checkpoint**: Core fix is in place. `onRemotePagesUpdate` now skips state overwrite when local changes are unsaved. All existing tests still pass.

---

## Phase 3: User Story 1 — Undone strokes excluded from PDF export (Priority: P1) 🎯 MVP

**Goal**: Verify that undone strokes do not appear in PDF exports, even when a remote sync event arrives during the auto-save debounce window.

**Independent Test**: Draw strokes, undo one, export to PDF — the PDF must not contain the undone stroke.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before the fix (or verify they pass with the fix)**

- [x] T006 [US1] Write unit test in `src/components/canvas/__tests__/canvas-editor-undo-export.test.ts` that simulates: (1) initial pages state with 3 strokes, (2) undo removes the last stroke via `setPages`, (3) a simulated remote update arrives with the pre-undo pages, (4) assert that the `onRemotePagesUpdate` guard prevents the state overwrite when `saveStatus` is `'unsaved'`
- [x] T007 [US1] Write regression test in the same file verifying that `onRemotePagesUpdate` DOES apply remote updates when `saveStatus` is `'saved'` (ensures multi-tab sync still works)

### Implementation for User Story 1

- [ ] T008 [US1] **MANUAL**: open a canvas document, draw 3 strokes, wait for auto-save, undo the last stroke, immediately export to PDF — verify the PDF contains only 2 strokes
- [ ] T009 [US1] **MANUAL**: undo all strokes, export to PDF — verify the PDF shows an empty page
- [ ] T010 [US1] **MANUAL**: undo a stroke then redo it, export to PDF — verify the PDF contains the redone stroke

**Checkpoint**: US1 acceptance scenarios verified — undone strokes are excluded from PDF export

---

## Phase 4: User Story 2 — Undone textboxes excluded from PDF export (Priority: P1)

**Goal**: Verify that undone textboxes (additions, removals, moves) do not appear in PDF exports.

**Independent Test**: Add textboxes, undo, export to PDF — only visible textboxes appear.

### Tests for User Story 2

- [x] T011 [US2] Add test case in `src/components/canvas/__tests__/canvas-editor-undo-export.test.ts` for textbox-add undo: initial state with 2 textboxes, undo last textbox addition, simulate remote update, assert guard prevents overwrite when `saveStatus` is `'unsaved'`
- [x] T012 [US2] Add test case for textbox-move undo: initial state with a moved textbox, undo the move, simulate remote update, assert guard preserves the pre-move position

### Implementation for User Story 2

- [ ] T013 [US2] **MANUAL**: add 2 textboxes, undo the last addition, export to PDF — verify only 1 textbox appears
- [ ] T014 [US2] **MANUAL**: move a textbox, undo the move, export to PDF — verify textbox is at its original position

**Checkpoint**: US2 acceptance scenarios verified — undone textboxes are excluded from PDF export

---

## Phase 5: User Story 3 — Multi-page undo consistency (Priority: P2)

**Goal**: Verify that undo/export consistency holds across multiple pages in a document.

**Independent Test**: Multi-page document, undo on different pages, export — each page reflects only visible content.

### Tests for User Story 3

- [x] T015 [US3] Add test case in `src/components/canvas/__tests__/canvas-editor-undo-export.test.ts` for multi-page scenario: pages array with 3 pages, undo a stroke on page 2, simulate remote update with all 3 pages containing the undone stroke, assert guard prevents overwrite

### Implementation for User Story 3

- [ ] T016 [US3] **MANUAL**: create a 3-page document, draw on page 2, undo on page 2, export to PDF — verify page 2 in the PDF does not contain the undone stroke
- [ ] T017 [US3] **MANUAL**: undo on page 1, navigate to page 3, export to PDF — verify page 1 reflects the undo in the PDF

**Checkpoint**: US3 acceptance scenarios verified — multi-page undo consistency confirmed

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories and cleanup

- [x] T018 Run full test suite (`pnpm test`) to confirm no regressions
- [x] T019 Run lint and format check (`pnpm lint && pnpm format:check`)
- [x] T020 Run build (`pnpm build`) to confirm production build succeeds
- [ ] T021 **MANUAL**: Edge case verification: undo an action and immediately export (within 800ms debounce window) — verify PDF is correct
- [ ] T022 **MANUAL**: Edge case verification: open document in two tabs, draw in tab A, undo in tab A, check tab B still receives the update when tab A's save completes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — contains the actual bug fix
- **US1 (Phase 3)**: Depends on Phase 2 — tests and verification for strokes
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with US1 and US2
- **Polish (Phase 6)**: Depends on all previous phases

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) — no dependencies on other stories

### Within Each User Story

- Write test first → verify it captures the expected behavior
- Then manual verification against acceptance scenarios

### Parallel Opportunities

- T001 and T002 can run in parallel (baseline checks)
- T006 and T007 can run in parallel (different test cases)
- US1, US2, and US3 test/verification phases can all run in parallel after Phase 2
- T018, T019, T020 can run in parallel (independent validation commands)

---

## Parallel Example: All User Stories After Foundational Fix

```bash
# After Phase 2 (foundational fix) is complete, all stories can proceed in parallel:

# US1 tests:
Task: "Unit test for stroke undo guard in src/components/canvas/__tests__/canvas-editor-undo-export.test.ts"
Task: "Regression test for remote sync when saved"

# US2 tests (parallel with US1):
Task: "Test textbox-add undo guard"
Task: "Test textbox-move undo guard"

# US3 tests (parallel with US1 and US2):
Task: "Test multi-page undo guard"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Baseline verification
2. Complete Phase 2: Foundational fix (T003-T005)
3. Complete Phase 3: US1 tests and verification
4. **STOP and VALIDATE**: Export PDF after undo — no undone strokes appear
5. This is sufficient to ship the fix

### Incremental Delivery

1. Setup + Foundational → Core fix in place
2. Add US1 tests + verification → Strokes verified (MVP!)
3. Add US2 tests + verification → Textboxes verified
4. Add US3 tests + verification → Multi-page verified
5. Polish → Full regression suite passes

---

## Notes

- The core fix is a 2-line change (T003 + T004) — everything else is testing and verification
- All three user stories share the same root cause and the same fix
- The guard approach is intentionally simple: skip remote updates when there are unsaved local changes
- Multi-tab sync is preserved: once the save completes, the echo guard handles our own echo, and legitimate remote changes apply normally
