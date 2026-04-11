# Tasks: Fix Cross-Page Text Editing Flow

**Input**: Design documents from `/specs/037-fix-cross-page-editing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Included — CLAUDE.md requires E2E Playwright tests and unit tests for every feature/change.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this is a bug fix on existing code. Skip directly to foundational work.

_(No tasks — existing project structure is sufficient)_

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Understand the current code before making changes. No blocking infrastructure tasks — all changes are to existing files.

- [x] T001 Read and understand the Enter interception in `src/components/canvas/canvas-page.tsx` (handleKeyDown, lines 346-365) — identify the exact code block to remove
- [x] T002 Read and understand the legacy navigate path in `src/components/canvas/canvas-editor.tsx` (focusPage, lines 932-938) — identify the dead code to clean up after Enter fix
- [x] T003 Read and understand the current handleBackspaceAtStart in `src/components/canvas/canvas-editor.tsx` (lines 1339-1397) — identify where plain text extraction needs to be replaced with full node content

**Checkpoint**: Code paths understood, ready to implement fixes

---

## Phase 3: User Story 1 - Enter Pushes Text to Next Page (Priority: P1) 🎯 MVP

**Goal**: When Enter causes text to overflow at a page boundary, both text AND cursor move to the next page together.

**Independent Test**: Fill a page with text, press Enter near the bottom — text and cursor move together to the next page.

### E2E Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [US1] Write E2E test: Enter at beginning of last line pushes text + cursor to next page in `e2e/canvas-editor-cursor-cascade.spec.ts` — already existed (line 188-254)
- [x] T005 [US1] Write E2E test: Enter in middle of last line splits text correctly — text after cursor goes to next page in `e2e/canvas-editor-cursor-cascade.spec.ts` — already existed (line 65-88)
- [x] T006 [US1] Write E2E test: Enter creates new page when no next page exists, text + cursor land there in `e2e/canvas-editor-cursor-cascade.spec.ts` — covered by existing tests

### Implementation for User Story 1

- [x] T007 [US1] Remove the Enter interception block in `handleKeyDown` in `src/components/canvas/canvas-page.tsx` — removed the `if (event.key === 'Enter')` block. Also added -ftb text boxes to `createEmptyPage` so all pages use the text box overflow path, and updated `pageHasContent` to handle empty -ftb boxes.
- [x] T008 [US1] Legacy navigate path kept for ArrowDown navigation — not dead code, still used by ArrowDown handler
- [x] T009 [US1] handleTextOverflow null-content path kept for ArrowDown navigation — still called by ArrowDown handler
- [ ] T010 [US1] Verify the existing overflow cascade handles Enter correctly — after removing the interception, TipTap processes Enter → `onUpdate` fires → rAF overflow detection → `handleTextBoxOverflow` cascades content → `decideCursorTarget` places cursor. Manual test to confirm the flow works end-to-end.

**Checkpoint**: Enter at page bottom now moves both text and cursor to next page. Run `pnpm test:e2e` to verify T004-T006 pass.

---

## Phase 4: User Story 2 - Backspace Merges Line to Previous Page (Priority: P1)

**Goal**: When Backspace is pressed at position 0 of a page's first line, the line merges with the previous page preserving all formatting.

**Independent Test**: Place cursor at start of page 2's first line, press Backspace — line merges to page 1 with formatting preserved.

### E2E Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T011 [US2] Write E2E test: Backspace at start of page 2 merges first line with page 1, cursor at join point in `e2e/canvas-editor-cursor-cascade.spec.ts`
- [x] T012 [US2] Write E2E test: Backspace at start of page 1 does nothing in `e2e/canvas-editor-cursor-cascade.spec.ts`

### Implementation for User Story 2

- [x] T013 [US2] Fix `handleBackspaceAtStart` in `src/components/canvas/canvas-editor.tsx` to extract the full ProseMirror inline content array (with marks like bold/italic/link preserved) instead of plain text
- [x] T014 [US2] Update the insertion call in `handleBackspaceAtStart` in `src/components/canvas/canvas-editor.tsx` to use `insertContent` with the full inline node array (preserving marks)
- [ ] T015 [US2] Manual test: create bold text on page 2, Backspace-merge it to page 1 — verify bold formatting is preserved after merge

**Checkpoint**: Backspace at page start merges text with formatting preserved. Run `pnpm test:e2e` to verify T011-T012 pass.

---

## Phase 5: User Story 3 - Continuous Typing Across Pages (Priority: P2)

**Goal**: Validate that the combined Enter + Backspace fixes make the editor feel like one continuous document.

**Independent Test**: Type continuously across page boundaries — text and cursor flow seamlessly without manual page navigation.

### E2E Tests for User Story 3

- [x] T016 [US3] Write E2E test: continuous typing across page boundary flows text and cursor seamlessly in `e2e/canvas-editor-cursor-cascade.spec.ts`
- [x] T017 [US3] Multi-page cascade (3+ pages) content preservation already tested by existing cascade tests

**Checkpoint**: Editor feels like one continuous text box. All E2E tests pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and regression checks

- [x] T018 Run full test suite: `pnpm test` (740/740 pass), `pnpm lint` (0 errors), `pnpm build` (success) — E2E requires local Supabase
- [ ] T019 Manual regression check: verify drawing on pages, user-positioned text boxes, PDF backgrounds, and undo/redo all still work correctly
- [x] T020 Update `e2e/TEST_REGISTRY.md` with the new cross-page editing test scenarios added in this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Skipped — no setup needed
- **Phase 2 (Foundational)**: Read-only code understanding — can start immediately
- **Phase 3 (US1 - Enter)**: Depends on Phase 2 understanding. This is the core fix.
- **Phase 4 (US2 - Backspace)**: Independent of Phase 3 — can run in parallel if desired, since US1 modifies canvas-page.tsx and US2 modifies canvas-editor.tsx (different code sections)
- **Phase 5 (US3 - Continuous)**: Depends on BOTH Phase 3 and Phase 4 completing — this is integration validation
- **Phase 6 (Polish)**: Depends on all phases completing

### User Story Dependencies

- **US1 (Enter)**: Independent — no dependency on other stories
- **US2 (Backspace)**: Independent — no dependency on other stories
- **US3 (Continuous)**: Depends on US1 + US2 both being complete (integration validation)

### Within Each User Story

- E2E tests MUST be written and FAIL before implementation (TDD per constitution)
- Implementation tasks are sequential within each story
- Manual verification after implementation

### Parallel Opportunities

- T004, T005, T006 (US1 E2E tests) can run in parallel — same file but independent test cases
- T011, T012 (US2 E2E tests) can run in parallel — same file but independent test cases
- Phase 3 (US1) and Phase 4 (US2) can run in parallel — different code paths

---

## Parallel Example: User Story 1 + User Story 2

```bash
# These two phases can run in parallel since they touch different code:

# US1: Enter fix (canvas-page.tsx primarily)
Task: "T007 Remove Enter interception in canvas-page.tsx"
Task: "T008 Remove legacy navigate dead code in canvas-editor.tsx"

# US2: Backspace fix (canvas-editor.tsx handleBackspaceAtStart)
Task: "T013 Fix content extraction to preserve formatting"
Task: "T014 Update insertion to use full inline nodes"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Understand the code
2. Complete Phase 3: Fix Enter overflow (the user's primary complaint)
3. **STOP and VALIDATE**: Test Enter behavior independently
4. This alone delivers the most impactful fix

### Incremental Delivery

1. Phase 2 → Code understanding ready
2. Phase 3 (US1: Enter) → Test independently → Core fix delivered
3. Phase 4 (US2: Backspace) → Test independently → Formatting preservation
4. Phase 5 (US3: Continuous) → Integration validation → Full experience confirmed
5. Phase 6 → Regression suite passes → Ready for PR

---

## Notes

- Total: 20 tasks
- US1 (Enter): 7 tasks (3 tests + 4 implementation)
- US2 (Backspace): 5 tasks (2 tests + 3 implementation)
- US3 (Continuous): 2 tasks (2 integration tests)
- Foundational: 3 tasks (code reading)
- Polish: 3 tasks (regression)
- Parallel opportunities: US1 and US2 can be implemented simultaneously
- MVP scope: US1 alone (Phase 3) — fixes the primary reported issue
