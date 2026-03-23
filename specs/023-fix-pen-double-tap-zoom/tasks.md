# Tasks: Fix Pen Double-Tap Triggering Zoom

**Input**: Design documents from `/specs/023-fix-pen-double-tap-zoom/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included per constitution (Principle II: Test-Driven Quality — write failing test first).

**Organization**: Tasks grouped by user story. This is a minimal bug fix touching a single source file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — this is a bug fix on an existing codebase. Phase skipped.

---

## Phase 2: Foundational (PointerEvent Pen Tracking)

**Purpose**: Add the `lastPointerType` tracking mechanism that both user stories depend on

**CRITICAL**: User story tasks cannot begin until this is complete

- [x] T001 Add `lastPointerType` variable and `pointerdown` listener inside the main `useEffect` in `src/hooks/use-pinch-zoom.ts` — declare `let lastPointerType = ''`, create `handlePointerDown` that sets `lastPointerType = e.pointerType`, register listener on container with cleanup in return function

**Checkpoint**: PointerEvent tracking is in place — user story implementation can begin

---

## Phase 3: User Story 1 — Pen Writing Without Accidental Zoom (Priority: P1) MVP

**Goal**: Pen/stylus double-taps must never trigger the app's zoom toggle

**Independent Test**: On iPad with Apple Pencil, double-tap the canvas with the pen — no zoom should occur

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [US1] Write failing test in `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts` — add a test case that verifies when `lastPointerType` is `'pen'`, the double-tap guard condition evaluates to false (i.e., pen taps are excluded). Test the guard logic: `!hasStylus(changedTouches) && lastPointerType !== 'pen'` should return false when either condition is true

### Implementation for User Story 1

- [x] T003 [US1] Update double-tap guard condition in `src/hooks/use-pinch-zoom.ts` (line ~407-411) — add `&& lastPointerType !== 'pen'` to the existing `if` condition so pen taps are excluded even when `hasStylus()` fails to detect the stylus
- [x] T004 [US1] Update stylus-lift reset condition in `src/hooks/use-pinch-zoom.ts` (line ~459-462) — change `hasStylus(e.changedTouches)` to `(hasStylus(e.changedTouches) || lastPointerType === 'pen')` so tap counter resets on pen lift regardless of `touchType` availability

**Checkpoint**: Pen double-taps no longer trigger zoom. Run `pnpm test` to verify tests pass.

---

## Phase 4: User Story 2 — Finger Double-Tap Zoom Still Works (Priority: P2)

**Goal**: Finger double-tap zoom (100% ↔ 200%) must continue working with a connected stylus

**Independent Test**: On iPad, double-tap the canvas with a finger — zoom should toggle normally

### Tests for User Story 2

- [x] T005 [US2] Write test in `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts` — verify that when `lastPointerType` is `'touch'` and `hasStylus()` returns false, the double-tap guard condition evaluates to true (finger taps are allowed through)

### Implementation for User Story 2

No additional implementation needed — the guard condition from T003 inherently allows finger taps (`lastPointerType === 'touch'` passes the `!== 'pen'` check). T005 validates this.

**Checkpoint**: Both pen exclusion and finger inclusion work. All tests pass.

---

## Phase 5: Polish & Verification

**Purpose**: Final validation across all environments

- [x] T006 Run `pnpm test` to confirm all unit tests pass in `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts`
- [x] T007 Run `pnpm lint` and `pnpm format:check` to confirm code quality
- [ ] T008 Run quickstart.md validation (PENDING — requires Vercel deployment and iPad testing) — deploy to Vercel preview and test on iPad with Apple Pencil per `specs/023-fix-pen-double-tap-zoom/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **User Story 1 (Phase 3)**: Depends on T001 (PointerEvent tracking in place)
- **User Story 2 (Phase 4)**: Depends on T003 (guard condition updated) — validates existing behavior is preserved
- **Polish (Phase 5)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 only. No dependencies on other stories.
- **User Story 2 (P2)**: Depends on T003 (the guard condition change). Validates that finger taps still work after the fix.

### Within Each User Story

- Test (T002/T005) MUST be written and FAIL before implementation (T003/T004)
- T003 and T004 modify the same file but different code sections — execute sequentially

---

## Parallel Example: User Story 1

```bash
# T002 (test) must complete first and FAIL
# Then T003 and T004 execute sequentially (same file, different sections)
Task: "T002 — Write failing test for pen double-tap exclusion"
# verify test fails
Task: "T003 — Update double-tap guard condition"
Task: "T004 — Update stylus-lift reset condition"
# verify test passes
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Add PointerEvent tracking
2. Complete T002: Write failing test
3. Complete T003 + T004: Implement fix
4. **STOP and VALIDATE**: Run `pnpm test`, test on iPad
5. Deploy to Vercel preview for user testing

### Incremental Delivery

1. T001 → PointerEvent tracking ready
2. T002–T004 → Pen zoom blocked, test passes (MVP!)
3. T005 → Finger zoom validated
4. T006–T008 → Full verification and deploy

---

## Notes

- All implementation changes are in a single file: `src/hooks/use-pinch-zoom.ts`
- All test changes are in a single file: `src/hooks/__tests__/use-pinch-zoom-stylus.test.ts`
- Total: 8 tasks (1 foundational + 3 US1 + 1 US2 + 3 polish)
- The fix is 3 lines of meaningful code change — intentionally minimal
- Commit after T004 (core fix complete) and after T007 (all checks pass)
