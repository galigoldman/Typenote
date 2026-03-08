# Tasks: Fix LaTeX Math UX

**Input**: Design documents from `/specs/002-fix-latex-math-ux/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — project CLAUDE.md requires tests for every feature or change.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Extend the MathExpression node schema with `originalText` attribute — required by US1 (to store text during creation) and US4 (to pre-fill the edit interface).

**⚠️ CRITICAL**: US1 and US4 depend on this phase completing first.

- [x] T001 Add `originalText` attribute to the MathExpression node definition in `src/lib/editor/math-extension.ts`: add a new attribute with `default: ''`, `parseHTML` reading from `data-original-text`, and `renderHTML` outputting `data-original-text`. Update the `insertMath` command signature to accept `(latex: string, originalText?: string)` and pass both attrs when creating the node. Update the `Commands` type declaration to match the new signature.
- [x] T002 Update existing tests for MathExpression in `src/lib/editor/math-extension.test.ts`: add test cases verifying `originalText` attribute defaults to `''`, parses from `data-original-text` HTML attribute, renders to `data-original-text`, and that `insertMath` command accepts and stores both `latex` and `originalText`.

**Checkpoint**: MathExpression node now supports `originalText`. Existing math nodes remain backward-compatible (default `''`).

---

## Phase 2: User Story 1 - Auto-Save Math on Enter (Priority: P1) 🎯 MVP

**Goal**: Math expressions persist immediately after pressing Enter — no need to click away or leave the node.

**Independent Test**: Type `$` → enter math → press Enter → refresh page → math is still present.

### Implementation for User Story 1

- [x] T003 [US1] Fix the `flush()` race condition in `src/hooks/use-auto-save.ts`: remove the `if (status === 'unsaved')` guard from the `flush` function so it always calls `performSave()` when invoked explicitly. Keep the `clearTimeout` of any pending debounced save. This ensures `flushSave()` called from `handleMathSubmit` always triggers an immediate save regardless of React state batching.
- [x] T004 [US1] Update `handleMathSubmit` in `src/components/editor/tiptap-editor.tsx`: change the `insertMath` call from `editor.chain().focus().insertMath(data.latex).run()` to `editor.chain().focus().insertMath(data.latex, text).run()` to pass the original natural language text. The `flushSave()` call after insertion is already present and will now work correctly due to T003.

### Tests for User Story 1

- [x] T005 [P] [US1] Update `flush()` unit tests in `src/hooks/use-auto-save.ts` (or create test file if not existing): add test that `flush()` triggers a save even when status is `'saved'` (verifying the race condition fix). Test that pending debounced saves are cancelled when `flush()` is called.

**Checkpoint**: Math auto-saves on Enter. Refresh page to confirm persistence.

---

## Phase 3: User Story 2 - Cursor Auto-Focus in Math Input Box (Priority: P1)

**Goal**: After pressing `$`, the cursor is immediately inside the math input box — user can type without clicking.

**Independent Test**: Press `$` in the editor → immediately type characters → they appear in the math input box.

### Implementation for User Story 2

- [x] T006 [US2] Fix auto-focus timing in `src/lib/editor/math-input-box.tsx`: wrap the `inputRef.current?.focus()` call inside the `useEffect` with `requestAnimationFrame(() => { inputRef.current?.focus(); })` to ensure focus is set after ProseMirror's event handling cycle completes.

### Tests for User Story 2

- [x] T007 [P] [US2] Update the auto-focus test in `src/lib/editor/math-input-box.test.tsx`: verify that `requestAnimationFrame` is called during mount and that `focus()` is called on the input ref inside the rAF callback. Mock `requestAnimationFrame` in the test to execute synchronously.

**Checkpoint**: Press `$` → input box appears with cursor ready. Type immediately without clicking.

---

## Phase 4: User Story 3 - Remove Blue Color Overlay (Priority: P2)

**Goal**: Rendered LaTeX expressions have no colored background — they blend with surrounding text.

**Independent Test**: Insert a math expression → visually confirm no colored background or border.

### Implementation for User Story 3

- [x] T008 [US3] Remove background and border styles from `MathNodeView` in `src/components/editor/math-node-view.tsx`: in the `NodeViewWrapper` `style` prop, remove `background: 'rgba(139, 92, 246, 0.08)'` and `border: '1px solid rgba(139, 92, 246, 0.2)'`. Change `cursor: 'default'` to `cursor: 'pointer'` to indicate clickability for the upcoming edit feature. Keep `display: 'inline'`, `borderRadius`, and `padding`.

**Checkpoint**: Math expressions render inline with no colored overlay. Cursor shows pointer on hover.

---

## Phase 5: User Story 4 - Click-to-Edit with Dual Edit Modes (Priority: P2)

**Goal**: Clicking a rendered math expression opens an edit interface with two modes: "Edit Expression" (natural language, AI re-conversion) and "Edit LaTeX" (direct code editing).

**Independent Test**: Click any rendered math → edit panel appears → modify and save in both modes.

**Dependencies**: Requires T001 (originalText attribute) and T008 (cursor pointer style).

### Implementation for User Story 4

- [x] T009 [US4] Add edit state and click handler to `MathNodeView` in `src/components/editor/math-node-view.tsx`: add React state for `isEditing: boolean`, `editMode: 'expression' | 'latex'`, `editValue: string`, `isLoading: boolean`, and `error: string | null`. Add an `onClick` handler on the `NodeViewWrapper` that sets `isEditing: true`, defaults `editMode` to `'expression'`, and pre-fills `editValue` with `node.attrs.originalText`. Extract `updateAttributes` from `NodeViewProps`.
- [x] T010 [US4] Add the floating edit panel UI to `MathNodeView` in `src/components/editor/math-node-view.tsx`: when `isEditing` is true, render a floating div (positioned below the node) containing: (a) two mode buttons — "Edit Expression" and "Edit LaTeX" — that switch `editMode` and update `editValue` to `node.attrs.originalText` or `node.attrs.latex` respectively, (b) a text input pre-filled with `editValue`, (c) a loading spinner when `isLoading` is true, (d) an error message when `error` is set. Style consistently with the existing `MathInputBox` component.
- [x] T011 [US4] Implement keyboard handlers for the edit panel in `src/components/editor/math-node-view.tsx`: on Enter in expression mode — if `editValue.trim()` equals `node.attrs.originalText`, close the panel without API call; if different, set `isLoading: true`, call `fetch('/api/ai/latex', ...)`, on success call `updateAttributes({ latex: data.latex, originalText: editValue.trim() })`, on failure set `error` message and keep panel open. On Enter in LaTeX mode — call `updateAttributes({ latex: editValue })` directly (no API call). On Escape in either mode — close the panel without changes. Prevent duplicate submissions when `isLoading` is true.
- [x] T012 [US4] Handle edge cases in the edit panel in `src/components/editor/math-node-view.tsx`: (a) when `originalText` is empty (legacy nodes), "Edit Expression" shows empty input ready for new text — treat any non-empty input as changed, (b) auto-focus the text input when the edit panel opens using `requestAnimationFrame`, (c) close any open edit panel when the user clicks outside (add a click-outside listener or check click target).

### Tests for User Story 4

- [x] T013 [P] [US4] Create test file `src/components/editor/math-node-view.test.tsx` with tests for: (a) clicking the rendered math expression opens the edit panel, (b) edit panel shows "Edit Expression" and "Edit LaTeX" mode buttons, (c) expression mode pre-fills input with `originalText` attribute, (d) LaTeX mode pre-fills input with `latex` attribute, (e) pressing Escape closes the panel without changes.
- [x] T014 [P] [US4] Add tests to `src/components/editor/math-node-view.test.tsx` for edit submission logic: (a) expression mode with unchanged text closes panel and makes zero `fetch` calls, (b) expression mode with changed text calls `fetch('/api/ai/latex')` and updates attributes on success, (c) LaTeX mode calls `updateAttributes` directly without fetch, (d) API failure in expression mode shows error and keeps panel open, (e) duplicate Enter presses while loading are ignored.

**Checkpoint**: Click any math expression → edit panel with dual modes works. Expression mode skips AI if unchanged. LaTeX mode updates directly.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup across all stories.

- [x] T015 Run full test suite (`npm run test`) and fix any failures across all modified files
- [x] T016 Manual validation against quickstart.md checklist in `specs/002-fix-latex-math-ux/quickstart.md`: verify all 8 manual test scenarios pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Phase 1 (T001 for updated `insertMath` signature)
- **US2 (Phase 3)**: No dependencies on other phases — can start after Phase 1 or in parallel with US1
- **US3 (Phase 4)**: No dependencies — can start in parallel with US1/US2
- **US4 (Phase 5)**: Depends on Phase 1 (T001 for `originalText` attribute) and Phase 4 (T008 modifies same file)
- **Polish (Phase 6)**: Depends on all story phases completing

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — independent of other stories
- **US2 (P1)**: Fully independent — touches only `math-input-box.tsx`
- **US3 (P2)**: Fully independent — touches only `math-node-view.tsx` (styles only)
- **US4 (P2)**: Depends on US3 completing first (both modify `math-node-view.tsx`). Depends on Foundational (needs `originalText` attribute).

### Parallel Opportunities

```
Phase 1 (Foundational): T001 → T002 (sequential, same file)

After Phase 1 completes:
  ┌─ Phase 2 (US1): T003 [P] T004 → T005
  ├─ Phase 3 (US2): T006 → T007
  └─ Phase 4 (US3): T008
       └─ Phase 5 (US4): T009 → T010 → T011 → T012 → T013 [P] T014

Phase 6 (Polish): T015 → T016
```

---

## Parallel Example: After Foundational

```bash
# These three can run in parallel (different files, no dependencies):
Task T003: "Fix flush() race condition in src/hooks/use-auto-save.ts"
Task T006: "Fix auto-focus timing in src/lib/editor/math-input-box.tsx"
Task T008: "Remove background styles in src/components/editor/math-node-view.tsx"

# These tests can run in parallel (different test files):
Task T005: "Tests for flush() fix in use-auto-save"
Task T007: "Tests for auto-focus fix in math-input-box"
Task T013: "Tests for edit panel in math-node-view"
Task T014: "Tests for edit submission logic in math-node-view"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001-T002)
2. Complete Phase 2: US1 - Auto-Save (T003-T005)
3. **STOP and VALIDATE**: Insert math → press Enter → refresh → math persists
4. Deploy/demo if ready

### Incremental Delivery

1. Foundational → `originalText` attribute ready
2. US1 (auto-save) → Test independently → Core fix shipped
3. US2 (cursor focus) → Test independently → Input flow fixed
4. US3 (remove overlay) → Test independently → Visual polish done
5. US4 (click-to-edit) → Test independently → Full edit capability
6. Polish → Full validation pass

### Recommended Execution (Solo Developer)

1. T001 → T002 (foundational, ~15 min)
2. T003 + T006 + T008 in parallel (3 quick fixes, different files, ~20 min)
3. T004 (update handleMathSubmit, ~5 min)
4. T005 + T007 in parallel (tests for US1 + US2, ~15 min)
5. T009 → T010 → T011 → T012 (US4 edit panel, sequential, ~45 min)
6. T013 + T014 in parallel (US4 tests, ~20 min)
7. T015 → T016 (polish, ~10 min)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are both P1 but touch different files — implement in parallel
- US3 and US4 both modify `math-node-view.tsx` — must be sequential (US3 first)
- No new dependencies, API routes, or database migrations required
- Existing `POST /api/ai/latex` endpoint is reused as-is for the edit feature
