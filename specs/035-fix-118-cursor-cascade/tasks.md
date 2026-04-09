---
description: 'Task list for 035-fix-118-cursor-cascade'
---

# Tasks: Fix Cursor Jumps in Multi-Page Reflow Cascade (#118 follow-up)

**Input**: Design documents from `/Users/glygwldmn/Typenote/.claude/worktrees/stateful-skipping-feigenbaum/specs/035-fix-118-cursor-cascade/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅
**Branch**: `035-fix-118-cursor-cascade` (built on top of `fix/118-reflow-surgical`)

**Tests**: REQUIRED. Per Constitution Principle II (test-driven quality) and CLAUDE.md ("when fixing a bug, write a failing test first, then fix and confirm it passes"). Failing E2E tests for each user story must exist and FAIL on the current branch before any implementation tasks are touched.

**Organization**: Tasks are grouped by user story. All three stories are P1 (per spec.md) but the implementation flows in priority sub-order: US1 (correct cursor target) is the foundation, US2 (move-first / remove timer) builds on top, US3 (no regression) is the verification gate.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependencies on incomplete tasks → can run in parallel
- **[Story]**: User story label (US1, US2, US3) — required on per-story phase tasks

## Path Conventions

- Single Next.js project at repo root.
- Source: `src/components/canvas/`, `src/lib/canvas/`
- Tests: `src/**/__tests__/*.test.ts` (unit/integration via Vitest), `e2e/*.spec.ts` (Playwright)

---

## Phase 1: Setup

**Purpose**: Sanity-check the working tree before touching anything. No new dependencies, no scaffolding — this is a surgical bugfix on top of an existing branch.

- [ ] T001 Verify working tree is clean and on the correct branch by running `git status` and `git branch --show-current`; expected branch: `035-fix-118-cursor-cascade`
- [ ] T002 Verify the partial reflow walk-around from commit `381bd6b` is present by running `git log --oneline 381bd6b..HEAD`; the three commits `381bd6b`, `584c655`, `47fa9a8` must all be in history
- [ ] T003 Verify the dev environment is healthy: `pnpm install && supabase start && pnpm test --run --bail` (existing tests must all pass before we touch anything)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract the cursor-target decision into a pure, dependency-free function and create the shared E2E test fixture. Both US1 and US2 implementations depend on this.

**⚠️ CRITICAL**: All Phase 3 / 4 / 5 tasks depend on Phase 2 completion.

- [ ] T004 [P] Create the pure cursor-target rule at `src/lib/canvas/cursor-target.ts` exporting `decideCursorTarget(cursorBlockIndex: number, cursorOffset: number, splitIndex: number): CursorTarget`, where `CursorTarget = { kind: 'stay' } | { kind: 'move'; newBlockIndex: number; offset: number }`. Implementation per research.md Decision 3.
- [ ] T005 [P] Create the failing unit test at `src/components/canvas/__tests__/cursor-target.test.ts` covering: cursor before split → 'stay'; cursor at boundary block → 'move' newBlockIndex=0; cursor past split → 'move' newBlockIndex=cursorBlockIndex-splitIndex; cursor at top-of-page (index 0) edge cases; preserves within-block offset. See quickstart.md step 2a for the exact test cases.
- [ ] T006 Run `pnpm test cursor-target` and confirm the unit test from T005 PASSES (the pure function from T004 should make it pass on the first run since both files are written from the same spec).
- [ ] T007 [P] Create the E2E test fixture helper at `e2e/helpers/canvas-fill-pages.ts` exporting `createDocumentWithNearFullPages(page, { pages: number; language?: 'en' | 'he' })`. The helper logs in (reusing `e2e/helpers/auth.ts`), creates a fresh document, and uses `page.evaluate` to bulk-fill the editor's text box with N pages of content via TipTap's `setContent` API (NOT keyboard typing — too slow and non-deterministic). Each page must be filled to within ~1 line of its bottom margin so a single Enter triggers an overflow cascade.
- [ ] T008 [P] Update the test registry at `e2e/TEST_REGISTRY.md` by adding a new section "Canvas Editor — Cursor Cascade" listing the 4 scenarios that will be added in Phase 3 / 4 (end-of-page Enter, middle-of-page Enter, RTL variants, latency-under-100ms). Per CLAUDE.md rule.

**Checkpoint**: The pure function exists and is unit-tested. The E2E fixture is ready. Implementation phases can now begin.

---

## Phase 3: User Story 1 — Cursor stays where I was typing (Priority: P1) 🎯 MVP

**Goal**: After an overflow cascade, the cursor lands at the user's logical edit position (same page if Enter was in the middle; next page if Enter was at the end). Never jumps to a deeper page.

**Independent Test**: In a 9-page document, repeat each scenario:

1. Place cursor at the end of the last line of page 1 → press Enter → cursor on page 2 (where the new empty paragraph went)
2. Place cursor in the middle of a paragraph in the middle of page 1 → press Enter → cursor still on page 1 (at the start of the new line)
3. Place cursor at the end of the last line of page 9 → press Enter → cursor on a freshly-created page 10

Verify all three in both LTR and RTL documents.

### Failing tests for User Story 1 (write first, must FAIL on current branch)

- [ ] T009 [P] [US1] Create the E2E test file at `e2e/canvas-editor-cursor-cascade.spec.ts` containing the test skeleton (login, fixture, 4 test cases declared but not yet asserting). Use the helper from T007.
- [ ] T010 [US1] In `e2e/canvas-editor-cursor-cascade.spec.ts`, add test "Enter at end of last page creates new page and cursor lands on it" that creates a 9-page near-full document, places the cursor at the end of the last visible line via `editor.commands.setTextSelection(editor.state.doc.content.size)`, presses Enter, and asserts the cursor's bounding rect is on a brand-new 10th page (within the page element with `data-page-id` matching the new page's ID).
- [ ] T011 [US1] In the same file, add test "Enter at boundary of pages 1-2 puts cursor on page 2, never on a deeper page" that places the cursor at the end of page 1's last line, presses Enter, waits for the cascade to settle (using a deterministic signal — see T012), and asserts the cursor is on page 2 (NOT page 3, 4, 5, ..., 9).
- [ ] T012 [US1] In the same file, add a small `waitForCascadeSettled(page)` helper that polls `cascadeTargetTextBoxIds.size === 0` via `page.evaluate` against a window-exposed debug ref, OR (cleaner) waits for the document's `selectionchange` event followed by one `requestAnimationFrame` of stillness. No `page.waitForTimeout` allowed.
- [ ] T013 [US1] In the same file, add test "Enter in middle of a paragraph keeps cursor on the same page" that places the cursor in the middle of a paragraph in the middle of page 1, presses Enter, and asserts the cursor is STILL on page 1 (the page element with the same `data-page-id` as before the keystroke).
- [ ] T014 [US1] In the same file, add a parallel `test.describe('RTL (Hebrew) document', ...)` block that re-runs T010, T011, T013 against a Hebrew document built via `createDocumentWithNearFullPages(page, { pages: 9, language: 'he' })`.
- [ ] T015 [US1] Run `pnpm test:e2e canvas-editor-cursor-cascade` and confirm all four tests (T010, T011, T013, T014's RTL block) FAIL on the current branch state. Capture the failure output as evidence that the tests reproduce the bugs. If any test passes, fix the test — it isn't reproducing the bug.

### Implementation for User Story 1

- [ ] T016 [US1] In `src/components/canvas/canvas-editor.tsx`, declare a new ref `const cascadeTargetTextBoxIds = useRef<Set<string>>(new Set())` near the existing `processingTextBoxOverflowRef` declaration. This is the structural signal that distinguishes outermost from inner cascade hops.
- [ ] T017 [US1] In `src/components/canvas/canvas-editor.tsx`, refactor `handleTextBoxOverflow` (currently around lines 1053–1185): at the very top, after the early returns, capture `const isInnerHop = cascadeTargetTextBoxIds.current.has(textBoxId);` and `cascadeTargetTextBoxIds.current.delete(textBoxId);`. Then capture `const cursorBlockIndex = editor.state.selection.$from.index(0); const cursorOffsetInBlock = editor.state.selection.$from.parentOffset;` from the editor's current selection. These two pieces of information are the inputs to the cursor-target rule.
- [ ] T018 [US1] In `handleTextBoxOverflow` (multi-block path), after computing `splitIdx`, call `decideCursorTarget(cursorBlockIndex, cursorOffsetInBlock, splitIdx)` (imported from `@/lib/canvas/cursor-target`) and store the result. Use it later (T024) to decide whether to set the next page's selection.
- [ ] T019 [US1] In `handleTextBoxOverflow`, after the existing `editor.chain().deleteRange(...).run()` call but BEFORE the `handleTextOverflow` hand-off, add a new line: when handing content forward, also `cascadeTargetTextBoxIds.current.add(nextPageTextBoxId);` so the next page's `handleTextBoxHeightMeasured` will be classified as an inner hop. The next page's text box ID is `${nextPage.id}-ftb` (the migrated flow text box convention).
- [ ] T020 [US1] In `handleTextBoxOverflow`, modify the `handleTextOverflow` hand-off to pass an additional `cursorTarget` parameter to `focusPage` (the parameter introduced in T024) when (a) `isInnerHop === false` AND (b) `decideCursorTarget` returned `{ kind: 'move', ... }`. The `cursorTarget` carries `{ blockIndex: result.newBlockIndex, offset: result.offset }`.
- [ ] T021 [US1] In `handleTextBoxOverflow`, when `isInnerHop === false` AND `decideCursorTarget` returned `{ kind: 'stay' }`, do NOT touch any editor's focus or selection. The current text box editor's selection survives the deleteRange unchanged because the cursor is before the deleted range (per research.md Decision 4).
- [ ] T022 [US1] In `handleTextBoxOverflow`, when `isInnerHop === true` (the call is part of a downstream cascade hop), do NOT touch any editor's focus or selection at any time during the function. The function still does the content split and the hand-off to `handleTextOverflow`, and still adds the next downstream text box ID to `cascadeTargetTextBoxIds`, but pure content propagation only.
- [ ] T023 [US1] Apply the same refactor to the **single-block path** (currently around lines 1188–1226 of `canvas-editor.tsx`). The single-block case requires deciding whether the user's cursor offset is before or after the word-boundary split position, and passing the corresponding cursor target to `focusPage`. Add a unit test in `src/components/canvas/__tests__/cursor-target.test.ts` for the single-block decision (cursor offset < split offset → 'stay'; cursor offset >= split offset → 'move' with the new text offset).
- [ ] T024 [US1] In `src/components/canvas/canvas-editor.tsx`, extend `focusPage` (currently around line 839): add an optional `cursorTarget?: { blockIndex: number; offset: number }` parameter. When provided AND the editor is found, compute the corresponding ProseMirror position by walking `editor.state.doc.child(0..blockIndex)` summing `nodeSize`, then `+1 + offset`, and call `editor.commands.setTextSelection(pos).focus().run()` instead of `editor.commands.focus('start')`. When `cursorTarget` is undefined, behavior is unchanged.
- [ ] T025 [US1] Run `pnpm test:e2e canvas-editor-cursor-cascade` and confirm all four tests (T010, T011, T013, T014) now PASS. If any fail, debug and fix before moving on.

**Checkpoint**: User Story 1 is fully functional. The cursor lands in the right place after every overflow event. The 300 ms timer is still in place at this point, so the cursor may still appear with a slight delay — that's User Story 2's job.

---

## Phase 4: User Story 2 — Cursor moves instantly, no perceptible delay (Priority: P1)

**Goal**: The cursor reaches its final position within 100 ms of the keystroke. The 300 ms `setTimeout` and the `cascadeCursorTargetRef` mechanism are removed entirely.

**Independent Test**: Record `performance.now()` at the keydown event and at the next `selectionchange` event in a real browser. The delta must be under 100 ms across at least 3 different document lengths (3, 6, 9 pages).

### Failing test for User Story 2 (write first, must FAIL on current branch state — i.e. on top of US1's implementation)

- [ ] T026 [US2] In `e2e/canvas-editor-cursor-cascade.spec.ts`, add test "cursor reaches final position within 100ms of keydown across 3, 6, 9 page documents" that runs the end-of-page-Enter scenario across three document lengths and asserts `t1 - t0 < 100` for each, where `t0` is captured via `await page.evaluate(() => performance.now())` immediately before `page.keyboard.press('Enter')` and `t1` is captured immediately after `waitForCascadeSettled`.
- [ ] T027 [US2] Run `pnpm test:e2e canvas-editor-cursor-cascade -g "100ms"` and confirm the test from T026 FAILS on the current state of the branch (with US1 implementation in place but US2 not yet started — the 300 ms timer makes the assertion fail). Capture the failure as evidence.

### Implementation for User Story 2

- [ ] T028 [US2] In `src/components/canvas/canvas-editor.tsx`, **delete** the `cascadeCursorTargetRef` declaration and ALL references to it. There should be zero remaining usages after this task.
- [ ] T029 [US2] In `src/components/canvas/canvas-editor.tsx`, **delete** the `__NEW__` sentinel logic from `handleTextBoxOverflow` and from `focusPage`. Replace the "find the new page after the cascade" code with a direct check inside `focusPage`'s polling loop — when `cursorTarget` is provided, the polling loop sets selection-then-focus on whichever editor it finds, regardless of whether it's an existing or freshly-mounted page.
- [ ] T030 [US2] In `src/components/canvas/canvas-editor.tsx`, **delete** the `setTimeout(() => { ... }, 300)` block at the end of `handleTextBoxOverflow`'s multi-block path. Verify by running `grep -n setTimeout src/components/canvas/canvas-editor.tsx` and confirming the only remaining `setTimeout` is the 50 ms editor-polling retry inside `focusPage` (which is explicitly allowed per SC-006).
- [ ] T031 [US2] In `src/components/canvas/canvas-editor.tsx`, **delete** the `isOutermostHop` local variable and the `outerTargetPageId` variable from `handleTextBoxOverflow`. They were only meaningful for the old guard mechanism; the new flow uses `isInnerHop` (T017) and `cursorTarget` (T020) instead.
- [ ] T032 [US2] In `src/components/canvas/canvas-editor.tsx`, in `focusPage`'s sync path (when the editor is already in `editorsRef.current`), call `editor.commands.setTextSelection(pos).focus()` immediately when `cursorTarget` is provided — same JavaScript task as the content move. This is the "move first" guarantee.
- [ ] T033 [US2] Run `pnpm test:e2e canvas-editor-cursor-cascade` and confirm: (a) the latency test from T026 now PASSES, (b) all four US1 tests still PASS.
- [ ] T034 [US2] Run `pnpm test cursor-target` and confirm the unit tests still pass (the pure function shouldn't have been touched but always re-verify after a refactor).

**Checkpoint**: User Story 2 is functional. The cursor moves on the same frame as the keystroke. All US1 tests still pass. The dead code for the old guard mechanism is gone.

---

## Phase 5: User Story 3 — Existing reflow walk-around still works, no regressions (Priority: P1)

**Goal**: The 53-block scenario from commit `381bd6b` (the original "walk-around" verification) still passes after the US1 + US2 changes. No data loss, no broken cascade behavior.

**Independent Test**: Insert 10 new paragraphs into the middle of a 43-paragraph baseline document via the editor and verify all 53 blocks are present after the cascade settles, correctly distributed across the appropriate pages.

### Failing test for User Story 3 (regression test — must PASS at the start of this phase)

- [ ] T035 [US3] In `e2e/canvas-editor-cursor-cascade.spec.ts`, add test "53-block scenario from commit 381bd6b — no data loss after cursor cascade fix" that builds a 43-paragraph baseline document via the helper, places the cursor in the middle, inserts 10 new paragraphs (one at a time, each followed by Enter), then waits for the cascade to settle and asserts that the union of all editor JSON contents on all pages contains all 53 paragraphs.
- [ ] T036 [US3] Run `pnpm test:e2e canvas-editor-cursor-cascade -g "53-block"` and confirm it PASSES. (This test should pass even before the fix because the original commit `381bd6b` already preserves content; this test is a regression gate to make sure US1 + US2 didn't break it.)
- [ ] T037 [US3] Run `pnpm test:e2e` (full E2E suite) to verify no regression in any other test, especially `e2e/canvas-editor.spec.ts` and `e2e/realtime-sync.spec.ts` which exercise the same canvas-editor component.
- [ ] T038 [US3] Run `pnpm test && pnpm test:integration` to verify all unit and integration tests still pass.

**Checkpoint**: All three user stories are independently verified. The fix is complete from a test-coverage standpoint.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Manual smoke test, documentation, PR.

- [ ] T039 [P] Manual smoke test in a real browser per quickstart.md step 4: reproduce Bug A, Bug B, Bug C in both LTR and RTL documents and visually verify the cursor (a) lands in the right place, (b) moves with no perceptible delay, (c) shows no flicker. Take a screen recording of one LTR run and one RTL run and attach to the PR.
- [ ] T040 [P] Run `grep -n setTimeout src/components/canvas/canvas-editor.tsx` and confirm the result is exactly the 50 ms polling loop inside `focusPage` (per SC-006). Paste the grep output into the PR description as evidence.
- [ ] T041 [P] Run `pnpm format && pnpm lint` to ensure no formatting or lint errors.
- [ ] T042 Run the FULL test pyramid one final time: `pnpm test && pnpm test:integration && pnpm test:e2e`. All must pass.
- [ ] T043 Commit the changes with a clear message describing the _why_ (cursor cascade fix) and the _what_ (decideCursorTarget rule + move-first + remove 300ms timer). Reference the spec by path. Use the `Co-Authored-By` footer per project convention.
- [ ] T044 Push the branch and open a PR against `fix/118-reflow-surgical` per quickstart.md step 5. Title: `fix(editor): cursor stays at user's edit position in multi-page cascade`. Body must include the test plan, the grep evidence from T040, and the screen recordings from T039.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. BLOCKS all user story phases.
- **Phase 3 (US1)**: Depends on Phase 2. Must complete before Phase 4 begins.
- **Phase 4 (US2)**: Depends on Phase 3 (because US2 deletes guards that US1 might still rely on if reordered).
- **Phase 5 (US3)**: Depends on Phase 4 (the regression check is done after both US1 and US2 are in place).
- **Phase 6 (Polish)**: Depends on Phase 5.

### Cross-Story Dependencies

This feature is unusual: all three stories are P1 and they touch the **same file** (`src/components/canvas/canvas-editor.tsx`) on the **same function** (`handleTextBoxOverflow`). Therefore:

- **US1, US2, US3 cannot be implemented in parallel by different developers** — they would conflict on every line of `handleTextBoxOverflow`. They are sequenced US1 → US2 → US3.
- **US3 is purely a verification phase** (no implementation tasks) — it's a regression gate, not new code.
- The MVP is **US1 + US2 together**. Either alone is a partial / broken fix:
  - US1 alone (without US2's timer removal) → cursor lands in the right place but with a 300 ms delay → user-visible flicker.
  - US2 alone (without US1's rule fix) → cursor moves instantly to the wrong place → worse than the current state.

### Within Each Phase

- Tests are written FIRST and must FAIL before the implementation tasks are touched (Constitution Principle II).
- Models / pure functions before services / orchestration — already structured this way (T004 pure function before T016+ orchestration).
- Within US1 / US2: T016 → T017 → T018 → ... → T025 must run sequentially because they all touch the same file (`canvas-editor.tsx`).
- T004, T005, T007, T008 can run in parallel (different files).
- T039, T040, T041 can run in parallel (different concerns).

### Parallel Opportunities

The only true parallelism in this feature is in Phase 2 (foundational) and Phase 6 (polish):

- Phase 2: T004 (`cursor-target.ts`), T005 (`cursor-target.test.ts`), T007 (`canvas-fill-pages.ts`), T008 (`TEST_REGISTRY.md`) can all be done in parallel — different files, no dependencies on each other (T005 depends on T004 only at _test run time_, not at _write time_).
- Phase 6: T039 (manual smoke), T040 (grep verification), T041 (format/lint) can all run in parallel.

Inside the user story phases, sequential execution is required because of file conflicts on `canvas-editor.tsx`.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch the four foundational tasks in parallel:
Task: "Create src/lib/canvas/cursor-target.ts with decideCursorTarget pure function"
Task: "Create src/components/canvas/__tests__/cursor-target.test.ts with 5 unit test cases"
Task: "Create e2e/helpers/canvas-fill-pages.ts with createDocumentWithNearFullPages helper"
Task: "Update e2e/TEST_REGISTRY.md with the new Canvas Editor — Cursor Cascade section"
```

After all four complete, run T006 to verify the unit test passes.

---

## Implementation Strategy

### MVP First (US1 + US2 together)

1. Complete Phase 1: Setup (3 tasks, ~5 min)
2. Complete Phase 2: Foundational (5 tasks, ~30 min)
3. Complete Phase 3: US1 (17 tasks, ~2 hours — the bulk of the work)
4. **DO NOT STOP HERE** — US1 alone leaves a 300 ms delay. The MVP requires US2.
5. Complete Phase 4: US2 (9 tasks, ~45 min — mostly deletions)
6. **STOP and VALIDATE**: All US1 + US2 tests must pass. Manual smoke test in browser.

This is the minimum viable working state.

### Hardening (US3 + Polish)

7. Complete Phase 5: US3 regression verification (4 tasks, ~15 min)
8. Complete Phase 6: Polish (6 tasks, ~30 min including PR write-up)

### Total estimate

- **MVP**: ~3.5 hours of focused work (Phases 1–4)
- **Full**: ~4.5 hours including polish and PR

---

## Notes

- **No new dependencies** — this is a refactor + bugfix, not a feature addition.
- **No data model changes** — the document JSONB is read and written in exactly the same shape as before.
- **No API changes** — purely client-side.
- **All file paths in the tasks are absolute or repo-relative.** No vague "the editor file" references — every task names the exact file.
- **Tests fail BEFORE implementation** — verify with `pnpm test:e2e` before starting T016.
- **Commit cadence**: one commit per checkpoint (end of Phase 2, end of Phase 3, end of Phase 4, end of Phase 5). No `--amend` to published commits.
- **Avoid `--no-verify`**, `git push --force`, or any other destructive shortcut. If a hook fails, fix the underlying issue.

## Format Validation

All 44 tasks above strictly follow the format `[ ] [TaskID] [P?] [Story?] Description with file path`. Spot-checks:

- T004 has [P], no story label (foundational), explicit file path ✅
- T010 has [US1], explicit file path, action verb ✅
- T030 has [US2], explicit file path, references SC-006 ✅
- T040 has [P], no story label (polish), explicit grep command ✅
