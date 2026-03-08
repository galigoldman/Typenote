# Tasks: Infinite Canvas with Moveable Elements & iPad Drawing

**Feature**: Transform Typenote into a freeform infinite canvas with moveable text blocks, Apple Pencil drawing, and cross-device sync
**Branch**: `002-ipad-pen-support`
**Total Tasks**: 45
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Phase 1: Setup

**Purpose**: Install dependencies, define shared types, create database migration

- [ ] T001 Install `@use-gesture/react` dependency via `pnpm add @use-gesture/react`
- [ ] T002 Create canvas TypeScript types (CanvasDocument, CanvasElement, TextBlock, DrawingLayer, Viewport, Stroke) in `src/lib/canvas/types.ts` per `specs/002-ipad-pen-support/data-model.md` and `specs/002-ipad-pen-support/contracts/canvas-document-format.md`
- [ ] T003 [P] Extend `Document` and `Folder` interfaces in `src/types/database.ts` to include canvas format types and `default_background` field on Folder
- [ ] T004 [P] Create Supabase migration `supabase/migrations/00003_add_folder_default_background.sql` adding `default_background TEXT NOT NULL DEFAULT 'blank'` to `folders` table

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user stories can start

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create global history manager (`HistoryManager` class with Command interface, undo/redo stacks, time-based grouping at 500ms) in `src/lib/canvas/history-manager.ts` — supports TextEditCommand, StrokeCommand, and CanvasCommand types per research.md Decision 2
- [ ] T006 [P] Create canvas viewport state store (pan x/y, zoom level, min/max zoom 0.25–4.0) in `src/lib/canvas/viewport-store.ts` using React context or Zustand
- [ ] T007 [P] Create EditorManager class (registry of active TipTap editor instances keyed by element ID, lazy create/destroy, get focused editor) in `src/lib/canvas/editor-manager.ts`
- [ ] T008 [P] Create element operations module (createElement, deleteElement, moveElement, resizeElement, updateZOrder) in `src/lib/canvas/element-operations.ts` — all operations create Command objects and push to HistoryManager
- [ ] T009 [P] Create viewport culling utility (given viewport bounds + zoom, return list of element IDs whose bounding box intersects viewport) in `src/lib/canvas/viewport-culling.ts`
- [ ] T010 [P] Create input router module (route PointerEvents based on `pointerType`: pen→draw, touch→pan/interact, mouse→tool-dependent) in `src/lib/canvas/input-router.ts`
- [ ] T011 Add canvas format discrimination to document page `src/app/(dashboard)/documents/[id]/page.tsx` — check `content.format === 'canvas'` and render canvas editor vs. existing linear TipTap editor
- [ ] T012 Add "Canvas Document" option to create document dialog `src/components/dashboard/create-document-dialog.tsx` — new documents with canvas format include `format: "canvas"`, `version: 1`, viewport at origin, background from folder default, one empty text block per `specs/002-ipad-pen-support/contracts/canvas-document-format.md`
- [ ] T013 Create canvas-aware save helper in `src/lib/actions/documents.ts` — serialize canvas state to JSONB, handle both canvas and linear formats on load

**Checkpoint**: Foundation ready — canvas types defined, history manager available, format routing in place, canvas documents can be created and saved

---

## Phase 3: User Story 1 — Freeform Canvas Navigation (Priority: P1) MVP

**Goal**: User opens a canvas document and sees an infinite canvas they can pan and zoom

**Independent Test**: Open a canvas document, verify canvas renders, pan in all directions, zoom in/out, close and reopen to verify viewport persists

### Implementation for User Story 1

- [ ] T014 [US1] Create canvas viewport component with CSS `transform: translate3d(x, y, 0) scale(zoom)` for pan/zoom in `src/components/canvas/canvas-viewport.tsx` — uses `@use-gesture/react` for pinch-zoom (touch), wheel-zoom (mouse), two-finger-drag pan (touch), middle-click-drag pan (mouse), spacebar+drag pan — reads/writes viewport store from T006
- [ ] T015 [US1] Create background renderer component in `src/components/canvas/background-renderer.tsx` — renders CSS repeating-linear-gradient (lined), repeating-linear-gradient grid (grid), repeating-radial-gradient (dotted), or transparent (blank) based on document background setting — scales with zoom level
- [ ] T016 [US1] Create canvas state management hook `useCanvasState` in `src/hooks/use-canvas-state.ts` — loads canvas document from Supabase, initializes viewport store with saved viewport, exposes elements map, provides addElement/updateElement/removeElement dispatchers, auto-saves viewport position on pan/zoom changes (debounced)
- [ ] T017 [US1] Wire canvas viewport into document page `src/app/(dashboard)/documents/[id]/page.tsx` — when `content.format === 'canvas'`, render CanvasViewport with BackgroundRenderer, pass canvas state from useCanvasState hook
- [ ] T018 [US1] Add zoom controls UI (zoom in/out buttons, zoom percentage display, fit-to-content button) to `src/components/canvas/canvas-toolbar.tsx`

**Checkpoint**: Canvas viewport renders, pan/zoom works on desktop and touch, viewport persists across sessions, background types display correctly

---

## Phase 4: User Story 2 — Moveable Rich-Text Blocks (Priority: P1)

**Goal**: Users create text blocks anywhere on canvas by double-clicking, edit with full TipTap formatting, drag to reposition, resize

**Independent Test**: Double-click canvas to create text block, type formatted text (bold, headings, math), drag to new position, resize, reload — verify content and position persist

### Implementation for User Story 2

- [ ] T019 [US2] Create canvas element wrapper component in `src/components/canvas/canvas-element.tsx` — absolutely positioned div with `left/top` from element x/y, drag handle on border for repositioning (pointer events), resize handles on edges/corners, selected state styling, click-outside to deselect — emits move/resize via element-operations (T008) which pushes to history
- [ ] T020 [US2] Create text block component in `src/components/canvas/text-block.tsx` — renders an independent TipTap editor instance (StarterKit with undoRedo disabled per research.md, plus existing extensions: Underline, TextAlign, TaskList, Link, MathExpression) inside CanvasElement wrapper — registers/unregisters with EditorManager (T007) — intercepts ProseMirror transactions via `dispatchTransaction` and wraps as TextEditCommands pushed to HistoryManager (T005)
- [ ] T021 [US2] Add double-click/double-tap handler on canvas viewport `src/components/canvas/canvas-viewport.tsx` — on double-click/tap on empty canvas area (no element hit), create a new text block element at the clicked canvas position via element-operations, focus the new editor
- [ ] T022 [US2] Connect editor toolbar to focused TipTap instance — modify `src/components/editor/editor-toolbar.tsx` (or create `src/components/canvas/canvas-editor-toolbar.tsx`) to read the currently focused editor from EditorManager and bind toolbar buttons to its commands (bold, italic, heading, list, math, etc.)
- [ ] T023 [US2] Integrate viewport culling for text blocks in `src/components/canvas/canvas-viewport.tsx` — only mount TextBlock components for elements whose bounding box is visible in current viewport (use viewport-culling from T009) — create/destroy TipTap editor instances as elements enter/leave viewport
- [ ] T024 [US2] Add element deletion — when a text block is selected (not in edit mode), pressing Delete/Backspace removes it via element-operations, pushable to undo

**Checkpoint**: Text blocks can be created, edited with full rich-text, moved, resized, and deleted. All actions are undoable. Content and positions persist across sessions.

---

## Phase 5: User Story 3 — Apple Pencil Drawing on Canvas (Priority: P1)

**Goal**: Users draw freeform strokes on the canvas with Apple Pencil (or mouse), with pressure sensitivity and real-time rendering

**Independent Test**: On iPad, draw strokes with Apple Pencil on canvas — verify pressure sensitivity, color/width changes, eraser works, strokes persist after save

**Note**: Can be worked on in parallel with US2 (different files)

### Implementation for User Story 3

- [ ] T025 [P] [US3] Create drawing layer component in `src/components/canvas/drawing-layer.tsx` — HTML5 Canvas element sized to viewport, renders strokes using existing `src/lib/drawing/stroke-renderer.ts` with canvas coordinate transforms (`ctx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY)`), supports pen/eraser tools — new strokes create StrokeCommands pushed to HistoryManager
- [ ] T026 [P] [US3] Adapt stroke renderer for canvas coordinate system in `src/lib/drawing/stroke-renderer.ts` — add support for rendering strokes at arbitrary canvas positions with zoom/pan transforms, maintain existing perfect-freehand integration
- [ ] T027 [US3] Extend drawing toolbar in `src/components/drawing/drawing-toolbar.tsx` (or create `src/components/canvas/drawing-toolbar.tsx`) — expand from 3 colors to minimum 5 (black, blue, red, green, purple), add more stroke widths (1, 2, 4, 8px), add eraser size options
- [ ] T028 [US3] Wire drawing layer into canvas viewport `src/components/canvas/canvas-viewport.tsx` — render DrawingLayer as a canvas overlay, route pen pointer events from input-router (T010) to drawing layer, route touch events to pan/zoom gesture handler
- [ ] T029 [US3] Implement eraser tool in `src/components/canvas/drawing-layer.tsx` — on eraser stroke, find and remove strokes whose paths intersect the eraser path, push removal as StrokeCommand to history
- [ ] T030 [US3] Serialize drawing strokes into canvas document format — when strokes change, update the drawing-layer element's `strokes` array in canvas state, trigger auto-save
- [ ] T031 [US3] Implement automatic input mode detection in `src/lib/canvas/input-router.ts` — pen on empty canvas→draw, pen on element→interact/edit, finger/touch→pan or interact, mouse→tool-dependent — handle edge case of pen near text block borders with hit-test threshold
- [ ] T032 [US3] Add manual mode toggle button to `src/components/canvas/canvas-toolbar.tsx` — toggle between "Draw Mode" and "Select Mode", visual indicator, overrides automatic detection when toggled

**Checkpoint**: Freeform drawing works with Apple Pencil (pressure sensitivity), mouse fallback, eraser, seamless pen/touch mode switching, manual toggle available, strokes persist

---

## Phase 6: User Story 5 — Save & Real-Time Sync (Priority: P1)

**Goal**: All canvas content syncs between devices within 3 seconds — positions, text, drawings

**Independent Test**: Open same canvas document on two devices, create/move/draw on one — verify changes appear on the other within 3 seconds

### Implementation for User Story 5

- [ ] T033 [US5] Refactor realtime sync to notification-then-fetch pattern in `src/hooks/use-realtime-sync.ts` — listen for `postgres_changes` UPDATE events, use only `updated_at` field as change signal (survives Supabase payload truncation), on change signal fetch full document via `supabase.from('documents').select('content').eq('id', docId).single()`, apply fetched content per `specs/002-ipad-pen-support/contracts/canvas-sync-protocol.md`
- [ ] T034 [US5] Create canvas-specific content diffing and application in `src/hooks/use-canvas-state.ts` — when remote content is received, diff against local canvas state, update only changed elements (positions, text content, strokes) without full re-render, preserve local viewport state
- [ ] T035 [US5] Integrate canvas auto-save into document sync hook `src/hooks/use-document-sync.ts` — serialize full canvas state (elements map, z-order, background, viewport) to JSONB on each change, use existing 800ms debounce auto-save, handle both canvas and linear document formats
- [ ] T036 [US5] Ensure editing lock works for canvas documents in `src/hooks/use-document-sync.ts` — when another device is editing, show "Editing elsewhere" banner and set canvas to read-only (disable element creation, movement, drawing)
- [ ] T037 [US5] Ensure offline cache works with canvas format in `src/lib/offline/document-cache.ts` and `src/lib/offline/sync-queue.ts` — canvas JSONB cached in IndexedDB same as linear, offline edits queued and replayed on reconnect

**Checkpoint**: Canvas content syncs between devices in real-time, editing lock prevents conflicts, offline changes queue and replay on reconnect

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Multi-select, copy/paste, performance, PWA touch optimization, and quality improvements

- [ ] T038 Create selection manager component in `src/components/canvas/selection-manager.tsx` — lasso selection (draw rectangle to select multiple elements), shift-click to add/remove from selection, visual selection indicators, batch move/delete of selected elements via element-operations
- [ ] T039 Implement copy/paste/duplicate of canvas elements in `src/lib/canvas/element-operations.ts` — Ctrl+C/V for copy/paste within document, Ctrl+D for duplicate, cross-document paste (store serialized elements in clipboard), pasted elements placed at viewport center with preserved relative positions
- [ ] T040 Implement z-order management UI — right-click context menu or keyboard shortcuts (Ctrl+] bring forward, Ctrl+[ send backward) to reorder element layers in `src/lib/canvas/element-operations.ts` and `src/components/canvas/canvas-element.tsx`
- [ ] T041 Add background type selector to canvas toolbar `src/components/canvas/canvas-toolbar.tsx` — dropdown to change document background (blank/grid/dotted/lined), persist via auto-save
- [ ] T042 Add folder default background setting in `src/components/dashboard/folder-card.tsx` or folder settings — dropdown to set `default_background` on folder, new documents in folder inherit this setting
- [ ] T043 Ensure touch targets meet 44x44pt minimum on canvas and drawing toolbars — audit `src/components/canvas/canvas-toolbar.tsx` and drawing toolbar button sizes using `@media (pointer: coarse)`, adapt canvas UI for tablet safe area insets
- [ ] T044 Verify PWA manifest and service worker work with canvas pages — ensure canvas route cached, offline launch shows cached canvas documents
- [ ] T045 Performance: viewport culling for drawing strokes in `src/components/canvas/drawing-layer.tsx` — only render visible strokes, batch Canvas 2D draw calls
- [ ] T046 Performance: verify 60fps rendering with 100 elements and 1,000 visible strokes — stress test, profile, optimize
- [ ] T047 Ensure existing linear documents continue to work — no regressions in text editing, math, auto-save, or sync
- [ ] T048 Keyboard shortcuts for canvas — Ctrl+Z/Cmd+Z undo, Ctrl+Shift+Z/Cmd+Shift+Z redo, Delete selected, Escape deselect, Ctrl+A select all
- [ ] T049 Run full test suite and fix any regressions — `pnpm test` and `pnpm test:e2e`, verify CI passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist)
- **US1 Canvas Navigation (Phase 3)**: Depends on Phase 2
- **US2 Text Blocks (Phase 4)**: Depends on Phase 3 (US1)
- **US3 Drawing + Mode Switching (Phase 5)**: Depends on Phase 3 (US1). **Can run in parallel with US2**
- **US5 Sync (Phase 6)**: Depends on Phase 2 + at least Phase 3
- **Polish (Phase 7)**: Depends on Phases 3–6 minimum

### Execution Flow

```
Phase 1: Setup
    ↓
Phase 2: Foundational
    ↓
Phase 3: US1 (Canvas Navigation)  ←── MVP
    ↓          ↓
Phase 4: US2   Phase 5: US3    ←── Can be parallel
    ↓              ↓
Phase 6: US5 (Sync)
    ↓
Phase 7: Polish (multi-select, copy/paste, PWA touch, perf)
```

### Parallel Opportunities

**Phase 2**: T006, T007, T008, T009, T010 (different files)
**Phase 4+5**: US2 and US3 are independent — can be parallel

---

## Implementation Strategy

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Canvas Navigation) → navigable canvas (MVP)
3. US2 (Text Blocks) + US3 (Drawing) → moveable text + Apple Pencil drawing
4. US5 (Sync) → canvas syncs between devices
5. Polish → multi-select, copy/paste, PWA touch, performance

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- All operations push to HistoryManager for undo/redo
- TipTap editors must have built-in history disabled (`StarterKit.configure({ undoRedo: false })`)
- Notification-then-fetch sync (US5) also fixes likely existing bug in linear editor sync
