# Tasks: Tight Text Selection Bounds

**Input**: Design documents from `/specs/014-tight-text-bounds/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Type definition change to support content bounds

- [x] T001 Add optional `contentBounds?: { offsetX: number; width: number }` property to `TextBox` interface in `src/types/canvas.ts` — this is a transient client-side measurement, not persisted to database

---

## Phase 2: Foundational (Measurement Pipeline)

**Purpose**: Build the content bounds measurement and propagation pipeline. MUST complete before any user story work.

- [x] T002 Implement `measureContentBounds()` function in `src/components/canvas/text-box.tsx` — inside the existing ResizeObserver callback, access `editor.view.dom` (ProseMirror container), iterate block-level children, create a Range around each block's inline content, call `range.getBoundingClientRect()`, compute the union rect across all blocks, convert from viewport-relative to container-relative coordinates using `containerRef.current.getBoundingClientRect()`. Return `{ offsetX, width }`. For empty content (no block children), return `undefined`. Apply 2px change threshold (skip update if delta < 2px, matching existing height threshold).
- [x] T003 [P] Add `onContentBoundsMeasured` callback prop to `TextBoxComponent` in `src/components/canvas/text-box.tsx` and thread it through `CanvasPage` component in `src/components/canvas/canvas-page.tsx` — mirror the existing `onHeightMeasured` / `onTextBoxHeightMeasured` callback pattern. Signature: `(pageId: string, textBoxId: string, bounds: { offsetX: number; width: number } | undefined) => void`
- [x] T004 Add `handleTextBoxContentBoundsMeasured` callback in `src/components/canvas/canvas-editor.tsx` — update `pages` state to set `contentBounds` on the matching text box, mirroring the existing `handleTextBoxHeightMeasured` pattern. Wire it to the `CanvasPage` component's new prop.
- [x] T005 Ensure `contentBounds` is stripped before saving text box data to Supabase in `src/components/canvas/canvas-editor.tsx` — find where pages/textBoxes are serialized for persistence and exclude the transient `contentBounds` property so it doesn't pollute the `pages` JSONB column.

**Checkpoint**: Content bounds are measured and stored in React state. Verify by logging `contentBounds` values — they should update when text is typed, deleted, or pasted.

---

## Phase 3: User Story 1 + 2 — Precise Selection Hit-Testing (Priority: P1) MVP

**Goal**: Rectangle selection and single-tap selection use tight content bounds instead of container width. Both stories share the same core change since both flow through `getSelectableBBox()`.

**Independent Test**: Create a text box with short left-aligned text. Draw a selection rectangle over only the empty right portion — it should NOT select the text box. Tap in the empty space — should NOT select. Tap on the actual text — should select.

### Implementation for User Story 1 + 2

- [x] T006 [US1][US2] Update `getSelectableBBox()` in `src/hooks/use-selection.ts` to use `contentBounds` when available: if `tb.contentBounds` exists, return `{ minX: tb.x + tb.contentBounds.offsetX - PADDING, minY: tb.y - PADDING, maxX: tb.x + tb.contentBounds.offsetX + tb.contentBounds.width + PADDING, maxY: tb.y + tb.height + PADDING }` where PADDING is ~4px. If `contentBounds` is undefined (empty text box), return a 24x24px minimum area at `(tb.x, tb.y)`. Add a `getContainerBBox(tb)` helper that returns the old full-container bounds (needed later for resize handles in US3).
- [x] T007 [US1][US2] Verify `computeUnionBBox()` in `src/hooks/use-selection.ts` correctly computes the union of tight bounds when multiple text boxes are selected — no code change expected since it already calls `getSelectableBBox()`, but verify the result is correct with tight bounds.

**Checkpoint**: Rectangle selection and tap selection now ignore empty whitespace in text box containers. All existing selection behavior for text overlapping actual content still works (no regressions).

---

## Phase 4: User Story 3 — Selection Visual Feedback (Priority: P2)

**Goal**: The selection highlight/border wraps tightly around actual text content. Resize handles remain at container bounds.

**Independent Test**: Select a text box with short text — the dashed selection border should wrap tightly around the text, not span the full container width. Resize handles should still appear at the container edges.

### Implementation for User Story 3

- [x] T008 [US3] Update `BoundingBox` component in `src/components/canvas/selection-overlay.tsx` to accept both a `tightBBox` (for the dashed selection border) and a `resizeBBox` (for the 8 resize handles). The selection border rectangle should use tight bounds; resize handle positions should use container bounds. Update the parent component to pass both bounding boxes — tight from `getSelectableBBox()` and container from `getContainerBBox()`.
- [x] T009 [US3] Update the selection hook in `src/hooks/use-selection.ts` to expose both tight and container union bounding boxes for the current selection — the tight bbox for the selection highlight, the container bbox for resize handle positioning. Pass both to the selection overlay via props or return value.

**Checkpoint**: Selection highlight visually matches the actual text content area. Resize handles remain at container edges. Multi-line text shows highlight around the widest line.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, verification, and regression testing

- [x] T010 Verify RTL text bounds — create a text box with Hebrew text, confirm `contentBounds.offsetX` is positive (content offset to right side of container), and selection highlight appears on the right side where the text actually is
- [x] T011 Verify Type mode is unaffected — confirm clicking empty space in a text box container in Type mode still places the cursor correctly (tight bounds should only apply in Select mode hit-testing, not in Type mode click handling)
- [x] T012 Run full test suite (`pnpm test`) and fix any regressions
- [x] T013 Run linter (`pnpm lint`) and formatter (`pnpm format:check`) to ensure code quality

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001) — type must exist before measurement code
- **US1+US2 (Phase 3)**: Depends on Phase 2 — content bounds must be measured before selection can use them
- **US3 (Phase 4)**: Depends on Phase 3 — tight bounds must exist in selection hook before overlay can use them
- **Polish (Phase 5)**: Depends on Phases 3 + 4

### User Story Dependencies

- **US1 + US2 (P1)**: Share implementation (`getSelectableBBox` change). Can start after Phase 2.
- **US3 (P2)**: Depends on US1/US2 completing first (needs `getSelectableBBox` and `getContainerBBox` to both exist). Adds visual layer on top.

### Within Each Phase

- Phase 2: T002 must complete before T003 (measurement fn must exist before callback wires it). T003 and T005 can run in parallel. T004 depends on T003.
- Phase 3: T006 before T007 (verify after change).
- Phase 4: T008 and T009 are interdependent (overlay and hook changes must align).

### Parallel Opportunities

- T003 [P] and T005 can run in parallel (different concerns in different files)
- Phase 5 tasks T010, T011 can run in parallel (independent verification)

---

## Parallel Example: Phase 2

```bash
# After T002 completes:
Task: "T003 - Add onContentBoundsMeasured callback in text-box.tsx and canvas-page.tsx"
Task: "T005 - Strip contentBounds from serialization in canvas-editor.tsx"
# Both can run in parallel since they touch different concerns
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (T001) — 1 task
2. Complete Phase 2: Foundational (T002-T005) — 4 tasks
3. Complete Phase 3: US1+US2 (T006-T007) — 2 tasks
4. **STOP and VALIDATE**: Test selection hit-testing independently
5. This gives functional tight selection bounds without visual feedback update

### Full Delivery

1. Complete MVP above
2. Add Phase 4: US3 (T008-T009) — visual feedback
3. Complete Phase 5: Polish (T010-T013) — edge cases and verification
4. Open PR against `main`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 share implementation because both flow through `getSelectableBBox()`
- No database migration needed — `contentBounds` is transient client-side state
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
