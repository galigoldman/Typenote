# Tasks: Fix Image Paste Target & Cross-Page Object Movement

**Input**: Design documents from `/specs/047-fix-image-paste-move/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extract reusable pure functions and add shared types needed by multiple user stories

- [x] T001 Extract `findClosestPage` as a pure function into `src/lib/canvas/page-detection.ts` — takes an array of page rects `{ id: string; top: number; height: number }[]` and a viewport center Y, returns `{ pageId: string; pageRelativeY: number }`. This function is used by both the system clipboard paste handler (US1) and the internal keyboard paste handler (US3). Include the existing intersection logic as the primary path and closest-distance as the fallback.
- [x] T002 Add `cross-page-move` variant to the `CanvasAction` discriminated union in `src/components/canvas/canvas-editor.tsx` (~line 510). Shape: `{ type: 'cross-page-move'; fromPageId: string; toPageId: string; strokes: Stroke[]; textBoxes: TextBox[]; images: ImageObject[]; dx: number; dy: number }`. No behavioral changes yet — just the type definition.

---

## Phase 2: User Story 1 — Paste Image on Current Page (Priority: P1) MVP

**Goal**: Images pasted from the system clipboard appear on the currently visible page, not page 1.

**Independent Test**: Paste an image while viewing page 3 of a 5-page document. Image appears on page 3.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T003 [P] [US1] Unit test for `findClosestPage` in `src/lib/canvas/__tests__/page-detection.test.ts` — test cases: (1) viewport center exactly on page 3 → returns page 3, (2) viewport center in gap between page 2 and 3 → returns nearest page, (3) viewport center past last page → returns last page, (4) single page document → returns that page, (5) viewport center above first page → returns first page.

### Implementation for User Story 1

- [x] T004 [US1] Replace the first-page fallback in the system clipboard paste handler in `src/components/canvas/canvas-editor.tsx` (~lines 2339-2343). After the existing intersection loop, if `targetPageId` is still null, call `findClosestPage()` with the page element rects and viewport center. Use the returned `pageId` and compute paste coordinates relative to that page. Remove the `pageEls[0]` fallback entirely.
- [x] T005 [US1] Apply the same `findClosestPage` fallback to the internal keyboard paste handler in `src/components/canvas/canvas-editor.tsx` (~lines 2223-2267). Currently this handler silently does nothing when no page intersects. Add the same fallback so internal paste also targets the correct page.
- [x] T006 [US1] Verify unit tests pass by running `pnpm test -- --run src/lib/canvas/__tests__/page-detection.test.ts`.

**Checkpoint**: Pasted images now land on the correct page. Unit tests confirm page detection logic. US1 is independently testable.

---

## Phase 3: User Story 2 — Move Objects Between Pages via Drag (Priority: P2)

**Goal**: Users can drag selected objects past a page boundary to move them to the adjacent page.

**Independent Test**: Select an image on page 2, drag it past the bottom boundary. Image moves to page 3.

### Tests for User Story 2

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US2] Unit test for boundary detection and coordinate transform in `src/lib/canvas/__tests__/page-detection.test.ts` (extend existing file). Add a `computeCrossPageTarget` pure function that takes `(objectY: number, dy: number, pageHeight: number, currentPageIndex: number, totalPages: number)` and returns `{ targetPageIndex: number; adjustedY: number } | null`. Test cases: (1) Y=1100 + dy=50 → next page, adjustedY=27, (2) Y=20 + dy=-30 → prev page, adjustedY=1113, (3) Y=500 + dy=10 → null (no crossing), (4) page 0, dy=-50 → null (clamped, can't go above first page), (5) last page, dy=50 past boundary → targetPageIndex = totalPages (signals new page needed).

### Implementation for User Story 2

- [x] T008 [US2] Implement `computeCrossPageTarget` pure function in `src/lib/canvas/page-detection.ts`. Takes object Y, displacement, page height, current page index, and total pages. Returns target page index and adjusted Y coordinate, or null if no boundary was crossed. Clamp coordinates to `[0, PAGE_WIDTH]` x `[0, PAGE_HEIGHT]`.
- [x] T009 [US2] Add `handleCrossPageMove` callback in `src/components/canvas/canvas-editor.tsx`. This function: (1) removes moved strokes/textBoxes/images from source page's arrays, (2) adds them to target page's arrays with adjusted Y coordinates, (3) if target page index equals total pages, creates a new empty page first using `createEmptyPage`, (4) pushes a single `cross-page-move` undo action, (5) clears redo stack, (6) triggers save.
- [x] T010 [US2] Add undo handler case for `cross-page-move` in the `handleUndo` function (~line 1855) in `src/components/canvas/canvas-editor.tsx`. On undo: (1) remove objects from `toPageId` by filtering arrays, (2) add objects back to `fromPageId` with original coordinates (stored in the action), (3) strip trailing empty pages if the target page is now empty. Add matching redo handler in `handleRedo`.
- [x] T011 [US2] Modify drag commit in `src/hooks/use-selection.ts` (~line 962, `handlePointerUp`). After computing final positions with dx/dy, check if any object's new Y exceeds `PAGE_HEIGHT` or is below 0. If so: (1) find the page order index for `activePageIdRef.current`, (2) call `computeCrossPageTarget`, (3) if result is non-null, call the new `onCrossPageMove` callback prop instead of the per-type move callbacks, (4) update `activePageIdRef.current` and `selectionPageId` to the target page ID, (5) update the cached selection bbox to reflect new coordinates.
- [x] T012 [US2] Add `onCrossPageMove` to the `useSelection` hook's props interface in `src/hooks/use-selection.ts`. Type: `(fromPageId: string, toPageId: string, strokes: Stroke[], textBoxes: TextBox[], images: ImageObject[], dx: number, dy: number) => void`. Pass `handleCrossPageMove` from `canvas-editor.tsx` as this prop.
- [x] T013 [US2] Verify unit tests pass by running `pnpm test -- --run src/lib/canvas/__tests__/page-detection.test.ts`.

**Checkpoint**: Objects can be dragged between adjacent pages. Undo restores original state. US2 is independently testable.

---

## Phase 4: User Story 3 — Move Objects Between Pages via Cut/Paste (Priority: P3)

**Goal**: Users can cut objects on one page, scroll to a different page, and paste them there.

**Independent Test**: Cut an image on page 1, scroll to page 4, paste. Image appears on page 4.

### Implementation for User Story 3

- [x] T014 [US3] Adjust internal paste offset calculation in `src/hooks/use-selection.ts` (`pasteAtPosition` ~line 442). When `clipboardRef.current.sourcePageId !== targetPageId` (pasting on a different page than where objects were copied/cut), compute the offset relative to the target page's center (`PAGE_WIDTH/2, PAGE_HEIGHT/2`) instead of the original `originX/originY`. This ensures pasted objects appear centered on the visible page rather than at potentially off-screen coordinates.
- [x] T015 [US3] Verify that the existing cut handler (`handleCut` or delete-after-copy flow in `use-selection.ts`) correctly removes objects from the source page and stores them in `clipboardRef` with the correct `sourcePageId`. No code change expected — this is a verification step. If any issue is found, fix it.

**Checkpoint**: Cut/paste moves objects between any two pages. US3 is independently testable.

---

## Phase 5: E2E Tests & Polish

**Purpose**: Browser tests covering all user stories and test registry updates

- [x] T016 [P] Write E2E test `e2e/image-paste-page.spec.ts` with scenarios: (1) paste image on single-page document → image on page 1, (2) scroll to page 3 of multi-page document, paste image → image on page 3 (verify by checking page 3's image count or position), (3) paste image when scrolled between pages → image on nearest page. Use shared login helper from `e2e/helpers/auth.ts`. Test credentials: `test@typenote.dev` / `Test1234`.
- [x] T017 [P] Write E2E test `e2e/cross-page-move.spec.ts` with scenarios: (1) drag image from page 2 past bottom boundary → image appears on page 3, (2) drag image past last page → new page created and image on new page, (3) undo cross-page move → image back on original page, (4) cut image on page 1, scroll to page 3, paste → image on page 3. Use shared login helper from `e2e/helpers/auth.ts`.
- [x] T018 Update `e2e/TEST_REGISTRY.md` — add "Image Paste Targeting" section (3 tests) and "Cross-Page Object Movement" section (4 tests).
- [x] T019 Run full test suite: `pnpm test && pnpm test:integration && pnpm test:e2e` to verify no regressions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on T001 (findClosestPage function)
- **US2 (Phase 3)**: Depends on T002 (cross-page-move type) and T001 (computeCrossPageTarget in same file)
- **US3 (Phase 4)**: Depends on US1 completion (paste fix) — uses the fixed viewport detection
- **E2E & Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Setup (T001) — no dependencies on other stories
- **US2 (P2)**: Can start after Setup (T001 + T002) — independent of US1
- **US3 (P3)**: Depends on US1 (uses the fixed paste detection for pasting on a different page)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure functions before integration with components
- Canvas-editor changes before use-selection changes (provides the callback)
- Verify tests pass after implementation

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T003 and T007 can run in parallel (test files, no deps between them)
- US1 and US2 can run in parallel after Setup (independent stories)
- T016 and T017 can run in parallel (different E2E test files)

---

## Parallel Example: Setup Phase

```bash
# Launch both setup tasks together:
Task: "Extract findClosestPage into src/lib/canvas/page-detection.ts"  # T001
Task: "Add cross-page-move to CanvasAction in canvas-editor.tsx"       # T002
```

## Parallel Example: Test Writing

```bash
# Launch US1 and US2 test tasks together:
Task: "Unit test for findClosestPage in page-detection.test.ts"        # T003
Task: "Unit test for boundary detection in page-detection.test.ts"     # T007
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: US1 — Fix Paste Page Detection (T003-T006)
3. **STOP and VALIDATE**: Paste an image while scrolled to page 3 — it should appear on page 3
4. This alone fixes the reported bug

### Incremental Delivery

1. Setup → Foundation ready
2. US1 (paste fix) → Bug fixed → Deploy (MVP!)
3. US2 (cross-page drag) → New capability → Deploy
4. US3 (cut/paste) → Full workflow → Deploy
5. E2E tests → Regression safety → Final deploy

---

## Notes

- No new dependencies — all changes use existing libraries
- No database changes — purely client-side
- The `findClosestPage` and `computeCrossPageTarget` functions are deliberately extracted as pure functions to enable unit testing without DOM or React rendering
- Existing move undo gaps (strokes and text boxes lack move undo for same-page moves) are out of scope — the new `cross-page-move` action covers cross-page moves for all object types
- Page coordinates are page-relative (0,0 = top-left). PAGE_WIDTH=794, PAGE_HEIGHT=1123
