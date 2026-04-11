# Tasks: Drawing Copy/Paste

**Input**: Design documents from `/specs/037-drawing-copy-paste/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Types)

**Purpose**: Add shared type definitions needed by all user stories

- [x] T001 Add `ClipboardData` interface (`strokes: Stroke[], textBoxes: TextBox[], originX: number, originY: number, sourcePageId: string`) and `'paste'` variant to `CanvasAction` union (`{ type: 'paste', pageId: string, strokes: Stroke[], textBoxes: TextBox[] }`) in `src/types/canvas.ts`

**Checkpoint**: Type definitions compile — all subsequent stories can reference them

---

## Phase 2: User Story 1 — Copy Selected Drawing via Action Bar (Priority: P1) — MVP

**Goal**: Users can select strokes/text boxes and copy them to an internal clipboard via a Copy button in the floating action bar. A "Copied!" confirmation appears.

**Independent Test**: Select strokes → tap Copy → verify clipboard holds correct stroke data and "Copied!" feedback shows.

### Implementation for User Story 1

- [x] T002 [US1] Add `clipboardRef: useRef<ClipboardData | null>(null)` and implement `copySelection()` function that deep-clones selected strokes/text boxes, computes origin center from `selectionBBox`, and stores in `clipboardRef`. Expose `copySelection` and `hasClipboardData` from the hook in `src/hooks/use-selection.ts`
- [x] T003 [US1] Add Copy button (clipboard icon) to the floating action bar between Ask AI and Delete buttons. Button calls `onCopySelection` prop. Show "Copied!" toast for 1500ms (same pattern as math node copy feedback) in `src/components/canvas/canvas-page.tsx`
- [x] T004 [US1] Wire `copySelection` from `useSelection` hook through to `canvas-page.tsx` as `onCopySelection` prop in `src/components/canvas/canvas-editor.tsx`
- [ ] T005 [P] [US1] (DEFERRED — unit tests for clipboard logic) Unit test for `copySelection` logic: verify deep clone independence (mutating clone doesn't affect original), origin center computation from bbox, clipboard replacement on second copy, strokes+textboxes both captured in `__tests__/hooks/use-selection-clipboard.test.ts`

**Checkpoint**: Copy button visible in action bar, copies selection data to internal clipboard. MVP delivers value as foundation for paste.

---

## Phase 3: User Story 2 — Paste Drawing via Pen Long-Press (Priority: P1)

**Goal**: In select mode, pen long-press (~500ms) on empty canvas space pastes clipboard contents at that location. Pasted elements get new unique IDs, are auto-selected, and paste is undoable as a single step.

**Independent Test**: Copy strokes → switch to select mode → pen long-press on empty space → verify pasted strokes appear at press location, are auto-selected, and undo removes them.

**Depends on**: US1 (clipboard must contain data)

### Implementation for User Story 2

- [x] T006 [US2] Add long-press detection to `handlePointerDown` in select mode: on pen input (`e.pointerType === 'pen'`) on empty space with clipboard data, start 500ms `longPressTimerRef` and record press position in `longPressOriginRef`. Cancel timer in `handlePointerMove` if pen moves >5px from origin (then fall through to normal selection). Cancel timer in `handlePointerUp` if still pending in `src/hooks/use-selection.ts`
- [x] T007 [US2] Implement `pasteAtPosition(x, y, pageId)` function: deep-clone clipboard strokes/text boxes, generate new unique IDs (`crypto.randomUUID()`), offset all points/positions from clipboard `originX/Y` to target `x/y`, recompute bounding boxes, add to page strokes/textBoxes arrays, return the pasted elements in `src/hooks/use-selection.ts`
- [x] T008 [US2] After paste, auto-select pasted elements by setting `selectedStrokeIds` and `selectedTextBoxIds` to the new IDs, computing `selectionBBox` and `tightSelectionBBox` from pasted elements, and setting state to `'selected'` in `src/hooks/use-selection.ts`
- [x] T009 [US2] Add `'paste'` case to `handleUndo` (remove all strokes/text boxes in the action from the page) and `handleRedo` (re-add them all) in `src/components/canvas/canvas-editor.tsx`
- [x] T010 [US2] Wire paste: expose `onPaste` callback from `useSelection`, call it from the long-press timer fire, push `{ type: 'paste', pageId, strokes, textBoxes }` to `undoStackRef`, clear `redoStackRef`, bump `historyVersion`, and call `triggerSave()` in `src/components/canvas/canvas-editor.tsx`
- [ ] T011 [P] [US2] (DEFERRED — unit tests for paste logic) Unit test for paste logic: verify position offset calculation (strokes shifted by delta from origin to target), new unique IDs generated (no collision with originals), bbox recomputation, deep clone independence in `__tests__/hooks/use-selection-clipboard.test.ts`

**Checkpoint**: Full copy → paste flow works with pen long-press. Pasted elements are auto-selected and undoable. Shape snap in drawing modes is unaffected.

---

## Phase 4: User Story 3 — Keyboard Copy/Paste for Desktop (Priority: P2)

**Goal**: Desktop users can use Cmd/Ctrl+C (copy with active selection) and Cmd/Ctrl+V (paste at viewport center).

**Independent Test**: Select strokes on desktop → Cmd+C → Cmd+V → verify drawing appears at viewport center.

**Depends on**: US1 (copy logic), US2 (paste logic)

### Implementation for User Story 3

- [x] T012 [US3] Add `useEffect` with window `keydown` listener: `Cmd/Ctrl+C` when `activeTool === 'select'` and selection exists calls `copySelection()`, `Cmd/Ctrl+V` when clipboard has data calls `pasteAtPosition()` with viewport center coordinates (computed from scroll position + container dimensions). `e.preventDefault()` to block browser default paste. Guard: only active when not in text editing mode in `src/components/canvas/canvas-editor.tsx`

**Checkpoint**: Desktop keyboard shortcuts work for copy and paste. Does not interfere with TipTap text editor shortcuts.

---

## Phase 5: User Story 4 — Visual Feedback During Long-Press (Priority: P2)

**Goal**: Show expanding SVG circle at pen press location during long-press (when clipboard has data) to indicate paste is imminent. Fades away if pen lifts early or clipboard is empty.

**Independent Test**: Initiate pen long-press with clipboard data → verify indicator appears and grows → lift early → verify indicator disappears.

**Depends on**: US2 (long-press detection mechanism)

### Implementation for User Story 4

- [x] T013 [P] [US4] Create `PasteIndicator` component: SVG `<circle>` with CSS `@keyframes` animation growing from `r=0` to `r=20` over 500ms, semi-transparent blue fill (20% opacity). Props: `x: number`, `y: number`, `isVisible: boolean`. Fade-out transition on `isVisible=false` in `src/components/canvas/paste-indicator.tsx`
- [x] T014 [US4] Add `longPressIndicator` state (`{ x: number, y: number, isVisible: boolean }`) to `useSelection` hook. Set `isVisible=true` and position on long-press start (only if clipboard has data). Set `isVisible=false` on timer cancel (movement/lift) or after paste completes in `src/hooks/use-selection.ts`
- [x] T015 [US4] Render `<PasteIndicator>` in the SVG overlay layer of canvas page (alongside `<SelectionOverlay>`), passing `longPressIndicator` props in `src/components/canvas/canvas-page.tsx`

**Checkpoint**: Visual indicator appears during long-press, grows over 500ms, and disappears on cancel or paste completion.

---

## Phase 6: User Story 5 — Multiple Paste (Priority: P3)

**Goal**: Paste the same copied drawing multiple times at different locations without re-copying. Each paste creates independent clones.

**Independent Test**: Copy once → paste at 3 locations → verify all 3 are independent editable objects.

**Depends on**: US2 (paste logic must NOT clear clipboard after paste — this is already the design)

**Note**: No additional code changes required. Multiple paste works by design because `pasteAtPosition()` reads from `clipboardRef` without clearing it, and each paste generates new unique IDs. This phase is verification-only.

**Checkpoint**: Verified that pasting multiple times produces independent clones, each undoable separately.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, cleanup, and test coverage across all stories

- [x] T016 Clear clipboard on document switch: add `useEffect` that resets `clipboardRef.current = null` when document ID changes in `src/components/canvas/canvas-editor.tsx`
- [x] T017 Clamp pasted elements within canvas bounds: after position offset, check if any pasted stroke/textbox bbox falls outside the page dimensions and adjust offset to keep everything visible in `src/hooks/use-selection.ts`
- [x] T018 E2E test for full copy/paste user flow: draw strokes → select → tap Copy → verify "Copied!" → pen long-press paste → verify pasted strokes appear at correct location → select pasted strokes → move/delete → verify independence from original in `e2e/drawing-copy-paste.spec.ts`
- [x] T019 E2E test for keyboard shortcuts: draw strokes → select → Cmd+C → Cmd+V → verify paste at viewport center → Cmd+Z → verify undo removes paste in `e2e/drawing-copy-paste.spec.ts`
- [x] T020 E2E test for edge cases: paste with empty clipboard (no-op), long-press cancelled by movement (no paste), shape snap still works in pen mode (no regression) in `e2e/drawing-copy-paste.spec.ts`
- [x] T021 Update E2E test registry with drawing copy/paste scenarios in `e2e/TEST_REGISTRY.md`
- [x] T022 Run full test suite: `pnpm test && pnpm test:e2e` to confirm no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Setup (T001) — MVP target
- **US2 (Phase 3)**: Depends on US1 (needs clipboard data from copy)
- **US3 (Phase 4)**: Depends on US1 + US2 (reuses copy and paste logic)
- **US4 (Phase 5)**: Depends on US2 (extends long-press detection with visual state)
- **US5 (Phase 6)**: Depends on US2 (verification only, no code changes)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
US1 (Copy) ──→ US2 (Paste) ──→ US3 (Keyboard)
                    │
                    ├──→ US4 (Visual Feedback)
                    │
                    └──→ US5 (Multiple Paste) [verification only]
```

- **US1**: Can start after Setup — no dependencies on other stories
- **US2**: Depends on US1 — needs copy to produce clipboard data
- **US3**: Depends on US1 + US2 — reuses both copy and paste functions
- **US4**: Depends on US2 — extends long-press with visual state
- **US5**: Depends on US2 — verification only, no new code

### Within Each User Story

- Types/interfaces before implementation
- Hook logic before UI wiring
- Core logic before undo integration
- Unit tests can run in parallel with UI tasks (different files)

### Parallel Opportunities

- T005 (US1 unit test) can run in parallel with T003 + T004 (different files)
- T011 (US2 unit test) can run in parallel with T009 + T010 (different files)
- T013 (US4 paste indicator component) can run in parallel with T014 (different files)
- US3 and US4 can run in parallel with each other (different files, no shared state)

---

## Parallel Example: User Story 1

```bash
# After T002 (hook logic) completes:

# These can run in parallel (different files):
Task T003: "Add Copy button to floating action bar in src/components/canvas/canvas-page.tsx"
Task T005: "Unit test for copySelection in __tests__/hooks/use-selection-clipboard.test.ts"

# Then sequential:
Task T004: "Wire copySelection through canvas-editor.tsx" (needs T003 props defined)
```

## Parallel Example: User Stories 3 + 4

```bash
# After US2 completes, these stories can run in parallel:

# US3 (keyboard shortcuts):
Task T012: "Add Cmd/Ctrl+C and Cmd/Ctrl+V in src/components/canvas/canvas-editor.tsx"

# US4 (visual feedback) — independent files:
Task T013: "Create PasteIndicator component in src/components/canvas/paste-indicator.tsx"
Task T014: "Add longPressIndicator state in src/hooks/use-selection.ts"
Task T015: "Render PasteIndicator in src/components/canvas/canvas-page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: User Story 1 — Copy (T002–T005)
3. **STOP and VALIDATE**: Copy button works, clipboard holds correct data
4. This alone delivers value as the foundation

### Core Feature (User Stories 1 + 2)

1. Setup + US1 → Copy works
2. US2 → Paste via pen long-press works
3. **STOP and VALIDATE**: Full copy/paste flow on iPad
4. This is the primary deliverable

### Full Feature (All Stories)

1. Setup + US1 + US2 → Core copy/paste
2. US3 + US4 (in parallel) → Keyboard shortcuts + visual feedback
3. US5 → Verify multiple paste
4. Polish → Edge cases, E2E tests, test registry

---

## Notes

- No database changes — all client-side
- No new dependencies — uses existing React, SVG, and Pointer Events APIs
- US5 requires zero code changes — multiple paste works by design
- Shape snap conflict is avoided by design (select mode vs. pen/highlighter mode)
- Clipboard uses `useRef` (not `useState`) to avoid unnecessary re-renders
