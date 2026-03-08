# Tasks: Freeform Canvas Editor

**Input**: Design documents from `/specs/001-canvas-editor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/canvas-data-contract.ts

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependency, define types, create database migration

- [x] T001 Install `perfect-freehand` dependency via `pnpm add perfect-freehand`
- [x] T002 [P] Create canvas TypeScript types in `src/types/canvas.ts` — copy interfaces from `specs/001-canvas-editor/contracts/canvas-data-contract.ts` (StrokePoint, BBox, Stroke, TextBox, CanvasPage, CanvasDocument, CanvasTool, ViewTransform, PAGE_WIDTH, PAGE_HEIGHT)
- [x] T003 [P] Create database migration `supabase/migrations/00003_add_pages_column.sql` — add `pages` JSONB column with default `'{"pages":[]}'` to the `documents` table
- [x] T004 [P] Update `src/types/database.ts` — add `pages` field (type `Record<string, unknown> | null`) to the Document interface

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities, persistence layer, and basic page structure that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Create coordinate transform utilities in `src/lib/canvas/coordinate-utils.ts` — implement `screenToPage(screenX, screenY, viewTransform)` and `pageToScreen(pageX, pageY, viewTransform)` functions, plus high-DPI canvas setup function (`setupHighDPICanvas` that scales canvas by `devicePixelRatio`)
- [x] T006 [P] Create stroke rendering utilities in `src/lib/canvas/stroke-utils.ts` — implement `getSvgPathFromStroke(points)` helper, `renderStroke(ctx, inputPoints, options)` using `getStroke()` from `perfect-freehand` + `Path2D`, and `computeBBox(points)` to precompute bounding boxes
- [x] T007 Update server actions in `src/lib/actions/documents.ts` — modify `updateDocumentContent` to accept and persist `pages` JSONB alongside `content`, update `createDocument` to initialize `pages` with one empty page
- [x] T008 Update `src/hooks/use-auto-save.ts` — extend the save callback to include `pages` data when saving
- [x] T009 Update `src/hooks/use-document-sync.ts` — handle loading `pages` from database on document open, pass `pages` to auto-save alongside content
- [x] T010 Update `src/hooks/use-realtime-sync.ts` — sync `pages` field in Realtime update events, apply remote page changes to local state
- [x] T011 Create `src/components/canvas/canvas-page.tsx` — single A4 page component (794×1123px) with the 5-layer architecture: page background div, `<canvas>` element for strokes (with high-DPI setup), text content layer, selection overlay placeholder, and transparent interaction layer div. Set `touch-action: none` on interaction layer. Accept `page` data, `activeTool`, and event handler props
- [x] T012 Create `src/components/canvas/canvas-editor.tsx` — document-level container component. Scrollable div wrapping a list of `CanvasPage` components. Manages `pages` state array, zoom `ViewTransform` (CSS transform on viewport wrapper), and `activeTool` state. Accepts document data and sync callbacks. Renders canvas-toolbar
- [x] T013 Integrate canvas-editor into the document page — modify `src/components/editor/tiptap-editor.tsx` (or the document page at `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`) to render `CanvasEditor` instead of/alongside the current TipTap editor, passing document data and save callbacks

**Checkpoint**: Foundation ready — basic empty A4 pages render, document saves/loads the `pages` JSONB, realtime sync works for page data

---

## Phase 3: User Story 1 — Pen Drawing on the Canvas (Priority: P1) MVP

**Goal**: Users can draw with a stylus and strokes persist across sessions

**Independent Test**: Open a document, draw with a stylus, navigate away, return — all strokes are preserved

### Implementation for User Story 1

- [x] T014 [US1] Create `src/hooks/use-drawing.ts` — hook that captures pointer events from the interaction layer, filters for `pointerType === "pen"`, collects `[x, y, pressure]` points (converted to page coordinates), calls `getStroke()` from `perfect-freehand` with `simulatePressure: false`, and renders the in-progress stroke on the working canvas layer via `Path2D` + `ctx.fill()`. On `pointerup`, finalize the stroke (compute bbox, assign UUID), add to page's strokes array, and render onto the committed canvas
- [x] T015 [US1] Integrate `useDrawing` with `canvas-page.tsx` — wire pointer event handlers (`onPointerDown`, `onPointerMove`, `onPointerUp`) from the interaction layer to the drawing hook when `activeTool === 'pen'`. Implement the two-canvas rendering strategy: committed canvas (all finalized strokes) + working canvas (current in-progress stroke)
- [x] T016 [US1] Implement stroke persistence — when a stroke is finalized, update the `pages` state in `canvas-editor.tsx`, triggering the existing auto-save debounce to persist to Supabase. On document load, re-render all stored strokes onto each page's committed canvas
- [x] T017 [US1] Implement stylus-only guard — in `use-drawing.ts`, reject `pointerType !== "pen"` events. Ensure mouse and touch input do NOT create strokes

**Checkpoint**: Pen drawing works end-to-end — draw with stylus, strokes appear in real time, persist after reload. Mouse/touch are ignored. This is the MVP

---

## Phase 4: User Story 2 — Default Text Typing (Priority: P1)

**Goal**: Keyboard typing works like a normal document — text flows naturally with all formatting

**Independent Test**: Open a document, type text, apply formatting (bold, lists, headings), save, reopen — all text and formatting preserved

### Implementation for User Story 2

- [ ] T018 [US2] Implement flow content editor in `canvas-page.tsx` — render a TipTap editor instance inside the text content layer, initialized with the page's `flowContent` data. The editor should fill the page width and grow vertically with content. Apply existing canvas background styles (lined, grid, blank)
- [ ] T019 [US2] Wire keyboard input routing — ensure keyboard events always reach the flowContent TipTap editor regardless of `activeTool`. When pen/eraser tool is active, set `pointer-events: none` on the text layer (so stylus touches pass through to canvas) but keep the editor focusable via keyboard
- [ ] T020 [US2] Integrate existing text formatting toolbar — connect the existing `EditorToolbar` component (from `src/components/editor/editor-toolbar.tsx`) to the active page's flowContent TipTap editor, preserving all formatting: bold, italic, underline, headings, lists, task lists, code blocks, links, math expressions, and auto-direction (RTL/LTR)
- [ ] T021 [US2] Persist flow content — on TipTap editor `onUpdate`, update the page's `flowContent` in the `pages` state, triggering auto-save. On load, initialize the editor from stored `flowContent` JSON

**Checkpoint**: Typing works exactly like the current editor. Text flows, formatting works, content saves and loads. No visual difference when canvas tools are not used

---

## Phase 5: User Story 3 — Tool Switching (Priority: P1)

**Goal**: Three-tool toolbar with clear active state indicator, keyboard typing works with any tool active

**Independent Test**: Switch between tools, verify visual indicator updates and each tool responds to stylus correctly

### Implementation for User Story 3

- [ ] T022 [US3] Create `src/components/canvas/canvas-toolbar.tsx` — toolbar component with three buttons: Pen (icon: Pen/PenLine), Eraser (icon: Eraser), Selection/Cut (icon: MousePointer2/Lasso). Show active tool with highlighted background. Use Lucide icons consistent with existing toolbar
- [ ] T023 [US3] Implement tool state in `canvas-editor.tsx` — manage `activeTool: CanvasTool` state (default: `'pen'`), pass to canvas-toolbar and all canvas-page instances. Toolbar button clicks update the active tool
- [ ] T024 [US3] Implement event routing in canvas-page interaction layer — based on `activeTool`, route pointer events to the appropriate handler: `'pen'` → `useDrawing`, `'eraser'` → `useEraser` (stub for now), `'selection'` → `useSelection` (stub for now). Set CSS `pointer-events` on text layer accordingly

**Checkpoint**: Three tools visible in toolbar, active tool visually indicated, switching works. Pen tool draws, other tools have stubs. Keyboard typing works regardless of selected tool

---

## Phase 6: User Story 4 — Eraser Tool (Priority: P2)

**Goal**: Touch a stroke with the eraser and the entire stroke disappears

**Independent Test**: Draw several strokes, switch to eraser, touch one stroke, verify only that stroke is removed and the deletion persists

### Implementation for User Story 4

- [ ] T025 [P] [US4] Implement hit detection in `src/lib/canvas/stroke-utils.ts` — add `isStrokeHit(stroke, eraserX, eraserY, eraserRadius)` function: AABB broad-phase filter (expand bbox by eraser radius + stroke half-width), then point-to-segment distance narrow-phase for each segment of the stroke polyline. Add `pointToSegmentDistance(px, py, ax, ay, bx, by)` helper
- [ ] T026 [US4] Create `src/hooks/use-eraser.ts` — hook that takes page strokes and the eraser point (from pointer events, converted to page coordinates). On `pointerdown`/`pointermove` with eraser active, call `isStrokeHit` for each stroke on the page. If hit, remove the stroke from the page's strokes array and trigger re-render of the committed canvas
- [ ] T027 [US4] Integrate eraser with `canvas-page.tsx` — when `activeTool === 'eraser'`, route pointer events to `useEraser`. On stroke removal, update `pages` state and re-render the committed canvas (redraw all remaining strokes). Trigger auto-save after erasure

**Checkpoint**: Eraser works end-to-end — touch/drag to erase whole strokes, changes persist after reload

---

## Phase 7: User Story 5 — Selection and Move Tool (Priority: P2)

**Goal**: Select objects (strokes, text boxes) via rectangle or lasso and drag them to a new position. Partial text selection splits text into two boxes

**Independent Test**: Draw strokes, select with lasso, drag to new position, verify positions persist. Type text, select part of it, verify it splits into two independent text boxes

### Implementation for User Story 5

- [ ] T028 [P] [US5] Implement selection geometry in `src/lib/canvas/stroke-utils.ts` — add `pointInPolygon(point, polygon)` (ray casting algorithm), `isStrokeInSelection(stroke, polygon)` (any-point method: stroke selected if ANY point is inside polygon), and `aabbIntersectsRect(bbox, selectionRect)` for rectangle selection
- [ ] T029 [P] [US5] Create `src/components/canvas/selection-overlay.tsx` — SVG overlay component that renders: the lasso/rectangle path being drawn (semi-transparent blue fill, dashed border), and bounding box with handles around selected objects (8 handle squares at corners and midpoints)
- [ ] T030 [US5] Create `src/hooks/use-selection.ts` — hook managing selection state machine: idle → drawing-selection (collecting lasso/rect points) → objects-selected (hit test complete) → dragging (moving objects). On pointer events: capture lasso polygon or rectangle bounds, run hit detection against all strokes and text boxes on the page, set selected object IDs. Support both rectangle (simple drag) and freeform lasso (detect based on initial drag direction or a toggle)
- [ ] T031 [US5] Implement drag-to-move in `use-selection.ts` — when objects are selected and user drags, apply CSS `transform: translate(dx, dy)` on a visual group during drag (no React re-renders). On `pointerup`, commit: update stroke points by adding delta to each point, update text box x/y positions, recompute bboxes, clear selection, trigger auto-save
- [ ] T032 [P] [US5] Create `src/components/canvas/text-box.tsx` — positioned text box component with absolute positioning (x, y, width, height in page coordinates). Contains its own TipTap `useEditor()` instance initialized from `content` prop. Renders inside the text content layer of canvas-page. Shows resize handles when selected. Auto-grows height based on content
- [ ] T033 [US5] Create `src/lib/canvas/text-split.ts` — implement `splitDocumentAtBlockIndex(doc, blockIndex)` that takes TipTap JSON and splits the content array at a block boundary, returning two TipTap JSON documents. Implement `findSplitIndex(editor, selectionBoundaryY)` that uses `editor.view.posAtCoords()` to find the ProseMirror position at the Y coordinate, resolves to the nearest block boundary, and returns the block index
- [ ] T034 [US5] Integrate text splitting into selection flow — when the selection boundary intersects a flowContent editor or a text box, determine the split point using `findSplitIndex`, call `splitDocumentAtBlockIndex`, update the original content with the first half, create a new TextBox with the second half positioned below the split. Add the new TextBox to the page's `textBoxes` array

**Checkpoint**: Selection tool works — rectangle and lasso selection, drag to move strokes and text boxes, text splitting at block boundaries. Positions persist after reload

---

## Phase 8: User Story 6 — A4 Pages with Infinite Scroll (Priority: P2)

**Goal**: Document displays as continuous A4 pages with visible boundaries, new pages auto-create as content grows

**Independent Test**: Open a document, observe A4 page with visible boundary. Draw past the bottom → new page appears. Type past the bottom → text flows to next page

### Implementation for User Story 6

- [ ] T035 [US6] Create `src/hooks/use-canvas-pages.ts` — hook managing the pages array: add/remove pages, reorder. Implement `addPage()` (creates new CanvasPage with UUID, next order number, empty strokes/textBoxes, empty flowContent). Expose `pages` state and mutation functions
- [ ] T036 [US6] Implement scroll-based page auto-creation — add IntersectionObserver in `canvas-editor.tsx` targeting the last page. When the last page becomes >10% visible, auto-append a new blank page. Remove trailing empty pages on save (keep minimum 1 page)
- [ ] T037 [US6] Implement content-based page auto-creation — in `use-drawing.ts`, when a stroke's Y coordinate exceeds `PAGE_HEIGHT`, clip the stroke to the current page and create a continuation on the next page (or just place it on the next page, auto-creating if needed). In flowContent, handle text overflow across page boundaries
- [ ] T038 [US6] Implement page virtualization — in `canvas-editor.tsx`, use IntersectionObserver on each page to track visibility. Only mount full canvas rendering (with committed strokes) for pages intersecting the viewport. Off-screen pages render as placeholder divs with correct height to maintain scroll position

**Checkpoint**: Multiple A4 pages render with visible boundaries, smooth scrolling between them. New pages auto-create on scroll or content overflow. Off-screen pages are virtualized

---

## Phase 9: User Story 7 — Pinch-to-Zoom (Priority: P3)

**Goal**: Two-finger pinch zooms in/out smoothly, drawing and typing remain accurately positioned at all zoom levels

**Independent Test**: On a touch device, pinch to zoom in, draw a stroke, verify it appears at the correct position. Zoom out, verify layout is correct

### Implementation for User Story 7

- [ ] T039 [US7] Create `src/hooks/use-canvas-zoom.ts` — hook that tracks active pointers in a `Map<pointerId, PointerEvent>`. When exactly 2 pointers are active, calculate distance and midpoint between them. On each `pointermove`, compute `scaleDelta = currentDist / lastDist` and call `applyZoom(scaleDelta, midpoint)`. Clamp scale between 0.25 and 5.0. Update ViewTransform state
- [ ] T040 [US7] Apply zoom via CSS transform in `canvas-editor.tsx` — set `transform: translate(panX, panY) scale(zoom)` and `transform-origin: 0 0` on the viewport wrapper div. Use CSS custom properties (`--pan-x`, `--pan-y`, `--zoom`) updated via `style.setProperty()` for smooth performance. Add `will-change: transform` hint
- [ ] T041 [US7] Handle trackpad zoom — in `canvas-editor.tsx`, listen for `wheel` events with `e.ctrlKey` (how browsers report trackpad pinch). Compute `scaleDelta = 1 - e.deltaY * 0.01`, apply zoom centered on cursor position. Call `e.preventDefault()` with `{ passive: false }` listener option
- [ ] T042 [US7] Re-render canvases at new resolution on zoom end — on `pointerup` (after a pinch gesture), re-setup each visible page's canvas with the new effective resolution (`pageSize * scale * devicePixelRatio`) and redraw all strokes. This replaces the CSS-scaled blurry rendering with crisp strokes at the new zoom level
- [ ] T043 [US7] Ensure coordinate accuracy at all zoom levels — update `screenToPage` in `coordinate-utils.ts` to account for the current `ViewTransform`. Verify that drawing and erasing produce correctly positioned strokes/hits when zoomed in or out

**Checkpoint**: Pinch-to-zoom works smoothly on touch devices. Trackpad zoom works on desktop. Drawing and typing are accurately positioned at all zoom levels

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, performance, and robustness

- [ ] T044 Handle devices without stylus support — detect if device supports `pointerType: "pen"` (via `navigator.maxTouchPoints` or first pointer event). If no stylus detected, hide or disable Pen and Eraser tool buttons in canvas-toolbar. Text typing and scrolling should always work
- [ ] T045 Performance optimization for dense documents — implement committed canvas caching: after rendering all finalized strokes, cache the result. Only re-render when strokes are added/removed/moved. Ensure documents with 500+ strokes across 10+ pages remain responsive
- [ ] T046 Existing document migration — implement dual-write in the save path: continue writing `content` (legacy TipTap JSON) alongside `pages`. On document load, if `pages` is empty but `content` exists, initialize pages from content (single page with content as flowContent)
- [ ] T047 Run full test suite and verify no regressions — ensure existing Vitest and Playwright tests pass. Verify the dashboard, folder navigation, document creation, and all existing text editing features work correctly with the new canvas architecture

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**
- **User Stories (Phase 3–9)**: All depend on Foundational phase completion
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 — Pen Drawing (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 — Text Typing (P1)**: Can start after Foundational — no dependencies on other stories
- **US3 — Tool Switching (P1)**: Can start after Foundational — enhances US1 (pen routing) but is independently testable
- **US4 — Eraser (P2)**: Depends on US1 (needs strokes to erase) and US3 (needs tool switching)
- **US5 — Selection & Move (P2)**: Depends on US1 (needs strokes to select) and US2 (needs text boxes). Most complex story
- **US6 — A4 Pages (P2)**: Can start after Foundational — basic single page is in Foundational, this adds multi-page behavior
- **US7 — Pinch-to-Zoom (P3)**: Can start after Foundational — independent of other stories but benefits from all being complete for full testing

### Within Each User Story

- Utility/library functions before hooks
- Hooks before components
- Components before integration
- Core implementation before persistence wiring

### Parallel Opportunities

- T002, T003, T004 can run in parallel (different files, no dependencies)
- T005, T006 can run in parallel (different utility files)
- T007, T008, T009, T010 can run in parallel (different hook/action files)
- T025, T028, T029 can run in parallel (different utility functions)
- T032 can run in parallel with T030, T031 (different component file)
- US6 and US7 can run in parallel after US1-US3 are complete

---

## Parallel Example: Foundational Phase

```
# Launch utility files in parallel:
Task T005: "Create coordinate-utils.ts"
Task T006: "Create stroke-utils.ts"

# After utilities, launch persistence updates in parallel:
Task T007: "Update server actions"
Task T008: "Update use-auto-save"
Task T009: "Update use-document-sync"
Task T010: "Update use-realtime-sync"
```

## Parallel Example: User Story 5

```
# Launch independent utility + component work in parallel:
Task T028: "Implement selection geometry in stroke-utils.ts"
Task T029: "Create selection-overlay.tsx"
Task T032: "Create text-box.tsx"

# Then sequential: hook → integration
Task T030: "Create use-selection.ts" (depends on T028)
Task T031: "Implement drag-to-move" (depends on T030)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Pen Drawing
4. **STOP and VALIDATE**: Draw with stylus, strokes persist. This is the MVP
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Pen Drawing) → MVP — core value delivered
3. US2 (Text Typing) → Hybrid model works — regular doc + drawing
4. US3 (Tool Switching) → Full toolbar — polished UX
5. US4 (Eraser) → Drawing is fully usable with create + delete
6. US5 (Selection & Move) → Freeform canvas unlocked — GoodNotes-like
7. US6 (A4 Pages) → Multi-page documents
8. US7 (Pinch-to-Zoom) → Touch navigation complete
9. Polish → Production-ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The spec requires testing per CLAUDE.md — write tests as part of each implementation task, not as separate tasks
- Total estimated new files: 14 | Modified files: 7 | New migration: 1
