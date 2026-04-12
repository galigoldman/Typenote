# Tasks: Auto-Expanding LaTeX Editor

**Input**: Design documents from `/specs/038-latex-editor-resize/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — required by CLAUDE.md (unit + E2E for every feature).

**Organization**: Tasks grouped by user story. US1 and US2 modify different files and can run in parallel after each is internally complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Comfortable Editing of Long LaTeX (Priority: P1) MVP

**Goal**: Replace the single-line `<input>` in the MathNodeView edit panel with an auto-expanding `<textarea>` that grows to fit long LaTeX expressions.

**Independent Test**: Open edit panel on a math expression with 150+ char LaTeX, verify editor shows full text without horizontal scrolling.

### Implementation for User Story 1

- [x] T001 [US1] Replace `<input>` with `<textarea rows={1}>` in the edit panel input at `src/components/editor/math-node-view.tsx` (line ~276). Change `useRef<HTMLInputElement>` to `useRef<HTMLTextAreaElement>`, update the `onChange`/`onKeyDown` event types from `React.KeyboardEvent<HTMLInputElement>` to `React.KeyboardEvent<HTMLTextAreaElement>`, and add `resize-none` CSS class.
- [x] T002 [US1] Add auto-resize callback in `src/components/editor/math-node-view.tsx`: create a `resizeTextarea` function that sets `style.height = 'auto'` then `style.height = scrollHeight + 'px'` on the textarea ref. Call it on initial render (inside the existing `useEffect` that auto-focuses), on every `editValue` change, and on mode switch.
- [x] T003 [US1] Add max-height constraint in `src/components/editor/math-node-view.tsx`: add `max-h-[200px]` and `overflow-y-auto` Tailwind classes to the textarea. This ensures extremely long expressions cap at ~8 lines and show a scrollbar (covers US3 for this component).
- [x] T004 [US1] Update unit tests in `src/components/editor/math-node-view.test.tsx`: change element queries from `getByRole('textbox')` or `querySelector('input')` to match a `<textarea>` element. Verify existing tests for Enter-to-submit, Escape-to-close, and mode-switching still pass.

**Checkpoint**: MathNodeView edit panel auto-expands for long LaTeX. Run `pnpm test` to verify.

---

## Phase 2: User Story 2 - Comfortable Initial Math Input (Priority: P2)

**Goal**: Replace the single-line `<input>` in the MathInputBox (`:{ ` trigger) with an auto-expanding `<textarea>` that grows for long plain-English descriptions.

**Independent Test**: Trigger math input with `:{ `, type a description longer than 400px, verify the box wraps and grows vertically.

### Implementation for User Story 2

- [x] T005 [P] [US2] Replace `<input>` with `<textarea rows={1}>` in `src/lib/editor/math-input-box.tsx` (line ~86). Change `useRef<HTMLInputElement>` to `useRef<HTMLTextAreaElement>`, update event types, and add `resize-none` CSS class.
- [x] T006 [US2] Add auto-resize callback in `src/lib/editor/math-input-box.tsx`: same `resizeTextarea` pattern as MathNodeView — reset height to `auto`, set to `scrollHeight + 'px'`. Call on mount (in existing `useEffect`) and on every `inputValue` change.
- [x] T007 [US2] Add max-height constraint in `src/lib/editor/math-input-box.tsx`: add `max-h-[200px]` and `overflow-y-auto` Tailwind classes (covers US3 for this component).
- [x] T008 [P] [US2] Update unit tests in `src/lib/editor/math-input-box.test.tsx`: change element queries to match `<textarea>`. Verify Enter-to-submit, Escape-to-close, quota display, and loading state tests still pass.

**Checkpoint**: MathInputBox auto-expands for long descriptions. Run `pnpm test` to verify.

---

## Phase 3: User Story 3 - Bounded Growth with Scroll (Priority: P3)

**Goal**: Verify that extremely long expressions (500+ chars) are capped at max height with a scrollbar. This behavior is already implemented by the `max-h-[200px]` + `overflow-y-auto` classes added in T003 and T007.

**Independent Test**: Paste 500+ char LaTeX, verify editor stops growing and shows scrollbar.

### Implementation for User Story 3

- [x] T009 [US3] Add E2E test scenario in `e2e/latex-math.spec.ts`: create a test that inserts a math expression, opens the edit panel in LaTeX mode, types/pastes a long expression (200+ chars), and verifies the textarea has grown (bounding box height > single line height). Also verify that for a very long expression (500+ chars), the textarea height is capped (does not exceed ~200px).

**Checkpoint**: E2E confirms auto-expand and max-height cap work in a real browser. Run `pnpm test:e2e` to verify.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all components.

- [x] T010 Run `pnpm test && pnpm test:e2e` to confirm all unit + E2E tests pass
- [x] T011 Run `pnpm lint && pnpm format:check` to confirm code style compliance
- [ ] T012 Verify dark mode appearance — open edit panel in dark mode, confirm textarea styling (background, text color, border) matches surrounding panel

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: No dependencies — can start immediately (different files from US1)
- **Phase 3 (US3)**: Depends on Phase 1 and Phase 2 (needs both components converted to textarea before E2E testing)
- **Phase 4 (Polish)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Independent — modifies `math-node-view.tsx` only
- **US2 (P2)**: Independent — modifies `math-input-box.tsx` only
- **US3 (P3)**: Depends on US1 + US2 (E2E verification of both)

### Parallel Opportunities

- **T001-T004 (US1) and T005-T008 (US2)** can run in parallel — they modify completely different files
- Within US1: T001 → T002 → T003 are sequential (same file); T004 can start after T003
- Within US2: T005 → T006 → T007 are sequential (same file); T008 can start after T007

---

## Parallel Example: US1 + US2

```bash
# These two stories can be implemented simultaneously by parallel agents:
Agent A: "Implement US1 — auto-expanding textarea in src/components/editor/math-node-view.tsx (T001-T004)"
Agent B: "Implement US2 — auto-expanding textarea in src/lib/editor/math-input-box.tsx (T005-T008)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: US1 (MathNodeView — most common editing flow)
2. **STOP and VALIDATE**: Run `pnpm test`, manually test editing a long LaTeX expression
3. This alone delivers the core value — comfortable LaTeX editing

### Incremental Delivery

1. US1 → Long LaTeX editing works (MVP)
2. US2 → Long math input descriptions also expand
3. US3 → E2E confirms bounded growth with scrollbar
4. Polish → Full test suite passes, code style clean

---

## Notes

- No new files created — all modifications to existing components
- No new dependencies — uses native `<textarea>` and vanilla JS
- Enter still submits (no newline) — existing `handleKeyDown` already prevents default
- The auto-resize pattern is ~5 lines of code per component
