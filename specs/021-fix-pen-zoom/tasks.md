# Tasks: Fix Pen Touch Triggering Zoom

**Input**: Design documents from `/specs/021-fix-pen-zoom/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Required per Constitution Principle II (bug fix → regression test first).

**Organization**: Tasks grouped by user story. US1 is the core fix; US2 is verification of existing guards.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Pen Drawing Without Accidental Zoom (Priority: P1) MVP

**Goal**: Prevent stylus double-tap from triggering zoom transitions, and prevent cross-input (pen→finger) false positive double-taps.

**Independent Test**: Double-tap canvas with Apple Pencil → no zoom. Double-tap with finger → zoom toggles 100% ↔ 200%.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (Constitution Principle II)**

- [x] T001 [P] [US1] Create unit test file with mock TouchEvent helpers at `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts` — test that a stylus double-tap calls `hasStylus(e.changedTouches)` and does NOT trigger zoom animation
- [x] T002 [P] [US1] Add unit test for finger double-tap still triggering zoom (regression guard) in `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts`
- [x] T003 [P] [US1] Add unit test for cross-input scenario: pen tap → finger tap within 300ms must NOT trigger zoom (FR-006) in `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts`

### Implementation for User Story 1

- [x] T004 [US1] Add `!hasStylus(e.changedTouches)` guard to double-tap detection condition in `src/hooks/use-pinch-zoom.ts` (line 408 — `handleTouchEnd`)
- [x] T005 [US1] Add stylus-lift tap counter reset (`tapCount = 0`, clear `tapTimer`) after the double-tap block in `src/hooks/use-pinch-zoom.ts` (`handleTouchEnd`)
- [x] T006 [US1] Run tests (`pnpm test`) — confirm T001, T002, T003 now pass

**Checkpoint**: Stylus double-tap no longer triggers zoom. Finger double-tap still works. Cross-input false positive prevented.

---

## Phase 2: User Story 2 - Pen Must Not Trigger Single-Finger Pan (Priority: P2)

**Goal**: Verify that existing `hasStylus()` guards for pinch-to-zoom and single-finger pan are correct and complete. No code changes expected — audit only.

**Independent Test**: Drag stylus across canvas while zoomed in → viewport does not pan, stroke is created.

### Verification for User Story 2

- [x] T007 [US2] Audit `handleTouchStart` (pinch, line 290) in `src/hooks/use-pinch-zoom.ts` — verify `!hasStylus(e.touches)` guard is present and correct
- [x] T008 [US2] Audit `handleTouchMove` (pinch, line 313) in `src/hooks/use-pinch-zoom.ts` — verify `hasStylus(e.touches)` early return is present and correct
- [x] T009 [US2] Audit `handleSingleTouchStart` (pan, line 518) in `src/hooks/use-pinch-zoom.ts` — verify `hasStylus(e.touches)` early return is present and correct

**Checkpoint**: All three existing stylus guards confirmed correct. No changes needed for US2.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all changes

- [x] T010 Run full test suite (`pnpm test`) and lint (`pnpm lint`) — confirm no regressions
- [x] T011 Run format check (`pnpm format:check`) and fix any formatting issues
- [ ] T012 Manual testing checklist on iPad with Apple Pencil: (1) pen double-tap → no zoom, (2) finger double-tap → zoom toggles, (3) rapid pen lift-and-place → no zoom, (4) pen tap then finger tap within 300ms → no zoom

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: No dependencies on US1 — can run in parallel (audit only)
- **Polish (Phase 3)**: Depends on US1 implementation (T004–T006) being complete

### Within User Story 1

- T001, T002, T003 (tests) MUST be written and FAIL before T004–T005 (implementation)
- T004 (guard) and T005 (counter reset) are sequential — both modify `handleTouchEnd`
- T006 (run tests) depends on T004 + T005

### Parallel Opportunities

- T001, T002, T003 can run in parallel (same file, but independent test cases)
- US1 (Phase 1) and US2 (Phase 2) can run in parallel (US2 is read-only audit)
- T007, T008, T009 can run in parallel (independent audit tasks)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Write failing tests (T001–T003)
2. Implement fix (T004–T005)
3. Confirm tests pass (T006)
4. **STOP and VALIDATE**: Stylus double-tap no longer zooms

### Full Delivery

1. Complete US1 (T001–T006) → core bug fixed
2. Complete US2 (T007–T009) → existing guards verified
3. Complete Polish (T010–T012) → full validation
4. Open PR against `main`

---

## Notes

- This is a single-file bug fix — all code changes are in `src/hooks/use-pinch-zoom.ts`
- US2 is audit-only (no code changes expected based on research.md verification)
- Constitution requires TDD for bug fixes: failing test → fix → passing test
- Total: 2 lines of logic added, ~5 lines of guard code
- Commit after T006 (tests pass) with message describing the fix
