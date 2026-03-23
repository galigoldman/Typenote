# Tasks: Change LaTeX Trigger from $ to :{

**Input**: Design documents from `/specs/020-change-latex-trigger/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included — project constitution requires tests for every feature.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 and share the same handler implementation, so they are in a combined phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Includes exact file paths in descriptions

---

## Phase 1: US1 + US2 — Core :{ Trigger & False-Positive Prevention (Priority: P1) — MVP

**Goal**: Replace the `$` keydown handler with a `{` keydown handler that checks for a preceding `:` character. The `:` is inserted normally; when `{` follows, the `:` is deleted and the LaTeX popup opens. No false triggers for normal `:` or `{` usage.

**Independent Test**: Type `:{` in the editor → popup appears, no stray characters. Type `:` then space → colon and space inserted, no popup. Type `{` alone → brace inserted, no popup.

### Tests for US1 + US2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [P] [US1] Add trigger behavior test: typing `{` after `:` in document opens popup — in `src/lib/editor/math-extension.test.ts`
- [x] T002 [P] [US1] Add trigger behavior test: the `:` character is deleted from document when `:{` triggers — in `src/lib/editor/math-extension.test.ts`
- [x] T003 [P] [US2] Add false-positive test: typing `{` without preceding `:` does NOT trigger popup — in `src/lib/editor/math-extension.test.ts`
- [x] T004 [P] [US2] Add false-positive test: typing `:` followed by any non-`{` character does NOT trigger popup — in `src/lib/editor/math-extension.test.ts`
- [x] T005 [P] [US2] Add false-positive test: typing `{` at position 0 (nothing before cursor) does NOT trigger popup — in `src/lib/editor/math-extension.test.ts`

### Implementation for US1 + US2

- [x] T006 [US1] Replace `handleKeyDown` plugin: change key check from `'$'` to `'{'`, add preceding-character check via `state.doc.textBetween(pos - 1, pos)`, delete `:` via `state.tr.delete(pos - 1, pos)`, dispatch transaction, then fire `math-input-trigger` event — in `src/lib/editor/math-extension.ts`
- [x] T007 [US1] Verify all T001–T005 tests pass after implementation — run `pnpm test src/lib/editor/math-extension.test.ts`

**Checkpoint**: `:{` trigger works, no false positives. This is the MVP — LaTeX input is fully functional with the new trigger.

---

## Phase 2: US3 — Code Context Suppression (Priority: P2)

**Goal**: Ensure `:{` typed inside code blocks or inline code inserts both characters literally — no popup.

**Independent Test**: Create a code block → type `:{` inside → both characters appear as text, no popup.

### Tests for US3

- [x] T008 [P] [US3] Add code-block suppression test: `:{` inside a code block does NOT trigger popup — in `src/lib/editor/math-extension.test.ts`
- [x] T009 [P] [US3] Add inline-code suppression test: `:{` with active code mark does NOT trigger popup — in `src/lib/editor/math-extension.test.ts`

### Implementation for US3

- [x] T010 [US3] Verify existing code context guards (`$from.parent.type.name === 'codeBlock'` and `codeMarkType.isInSet`) are preserved in the new `{` handler — in `src/lib/editor/math-extension.ts`. These guards were carried forward from the `$` handler; confirm T008–T009 pass without additional changes.

**Checkpoint**: Code contexts correctly suppress the trigger.

---

## Phase 3: US4 — Old $ Trigger Removed (Priority: P2)

**Goal**: Typing `$` inserts a literal dollar sign — no popup.

**Independent Test**: Type `$` in the editor → `$` appears as text, no popup.

### Tests for US4

- [x] T011 [US4] Add test: typing `$` inserts literal dollar sign, no popup triggered — in `src/lib/editor/math-extension.test.ts`

### Implementation for US4

- [x] T012 [US4] Confirm T011 passes — the `$` handler was removed in T006 (the new handler only intercepts `{`), so `$` naturally inserts as a character. No additional code changes needed.

**Checkpoint**: Old trigger fully removed. All 4 user stories verified.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Update references and run full validation.

- [x] T013 [P] Update comment "Math input ($ key → LaTeX conversion)" to reference `:{` — in `src/components/canvas/canvas-editor.tsx` (line 359)
- [x] T014 [P] Update comment "math input box ($ key → LaTeX)" to reference `:{` — in `src/components/canvas/canvas-editor.tsx` (line 1930)
- [x] T015 [P] Update comment "Listen for math input trigger from ProseMirror plugin" to mention `:{` — in `src/components/editor/tiptap-editor.tsx` (line 164)
- [x] T016 Run full test suite `pnpm test` to confirm no regressions
- [x] T017 Run lint `pnpm lint` and format check `pnpm format:check` — fix any issues
- [x] T018 Manual smoke test per quickstart.md: test `:{` trigger, `$` literal, `:` + space, `:{` in code block

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1 + US2)**: No prerequisites — can start immediately (this is the core change)
- **Phase 2 (US3)**: Depends on Phase 1 completion (handler must exist to test code guards)
- **Phase 3 (US4)**: Depends on Phase 1 completion (old handler removal is a side effect of T006)
- **Phase 4 (Polish)**: Depends on Phases 1–3 completion

### User Story Dependencies

- **US1 + US2 (P1)**: Independent — core trigger change
- **US3 (P2)**: Depends on US1/US2 handler existing. Code guards are carried forward from old handler.
- **US4 (P2)**: Depends on US1/US2 handler change. Old `$` removal is automatic.

### Within Phase 1

- T001–T005 (tests) can ALL run in parallel — they test different scenarios
- T006 (implementation) depends on T001–T005 being written (TDD: write tests first)
- T007 (verification) depends on T006

### Parallel Opportunities

- T001–T005 are all [P] — write all test cases simultaneously
- T008–T009 are [P] — write code context tests simultaneously
- T013–T015 are [P] — update comments simultaneously
- Phase 2 and Phase 3 can run in parallel after Phase 1 (different test concerns, same file but non-overlapping sections)

---

## Parallel Example: Phase 1 Tests

```bash
# Launch all test-writing tasks together:
Task: "T001 - Trigger behavior test: :{ opens popup"
Task: "T002 - Trigger behavior test: : deleted on trigger"
Task: "T003 - False-positive test: { alone no trigger"
Task: "T004 - False-positive test: : + non-{ no trigger"
Task: "T005 - False-positive test: { at position 0 no trigger"
```

---

## Implementation Strategy

### MVP First (Phase 1 Only)

1. Write T001–T005 tests (TDD — they should FAIL)
2. Implement T006 (core handler change)
3. Run T007 (verify tests pass)
4. **STOP and VALIDATE**: `:{` works, `$` doesn't trigger, no false positives

### Incremental Delivery

1. Phase 1 → Core trigger works (MVP!)
2. Phase 2 → Code context suppression verified
3. Phase 3 → Old trigger removal confirmed
4. Phase 4 → Comments updated, full suite green, smoke tested
5. Open PR against `main`

---

## Notes

- All 4 user stories modify or verify `src/lib/editor/math-extension.ts` — the single source of truth for trigger behavior
- US3 and US4 are largely verification tasks — the implementation in T006 handles them as side effects
- The `math-input-box.tsx` and its tests require NO changes — popup behavior is unchanged
- Both `tiptap-editor.tsx` and `canvas-editor.tsx` consume the `math-input-trigger` event and need no functional changes — only comment updates
- Total: 18 tasks, lightweight feature — most tasks are test-writing and verification
