# Tasks: Enable Draw Mode in Text Documents

**Input**: Design documents from `/specs/025-doc-draw-mode/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 but sequenced so US1 delivers a minimal drawing experience before US2 adds the full toolkit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Routing fix and shared constants that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Update `isTextDocument` routing logic to support `mode: "text-overlay"` in pages JSONB in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`. Change from `!typedDocument.pages && !typedDocument.material_id` to also check `(typedDocument.pages as any)?.mode === 'text-overlay'`. See data-model.md for the pages structure.
- [x] T002 [P] Extract pen/highlighter/eraser color arrays and size constants from `src/components/canvas/canvas-editor.tsx` (lines ~101-139) into a new shared constants file `src/lib/canvas/drawing-constants.ts`. Export `PEN_COLORS`, `HIGHLIGHTER_COLORS`, `PEN_SIZES`, `HIGHLIGHTER_SIZES`, `ERASER_SIZES`, `DEFAULT_PEN_COLOR`, `DEFAULT_PEN_SIZE`, `DEFAULT_HIGHLIGHTER_COLOR`, `DEFAULT_HIGHLIGHTER_SIZE`, `DEFAULT_ERASER_SIZE`. Update canvas-editor.tsx to import from the new shared file.

**Checkpoint**: Routing correctly identifies text docs with drawing overlays; drawing constants are shared.

---

## Phase 2: User Story 1 - Draw on Text Documents (Priority: P1) MVP

**Goal**: Users can activate draw mode in a text document, draw pen strokes in real time, and strokes persist across page reloads.

**Independent Test**: Open a text-only document, verify draw toggle appears in toolbar, tap it, draw strokes, reload page — strokes should still be there.

### Implementation for User Story 1

- [x] T003 [US1] Create `src/components/editor/drawing-overlay.tsx` — a canvas overlay component that renders on top of the TipTap editor content area. Must include:
  - Two absolutely-positioned `<canvas>` elements (committed strokes + working/in-progress strokes), matching the layering pattern from `src/components/canvas/canvas-page.tsx` (layers 2-3)
  - High-DPI canvas setup using `setupHighDPICanvas()` from `src/lib/canvas/coordinate-utils.ts`
  - Accept props: `strokes: Stroke[]`, `activeTool: CanvasTool`, `penColor`, `penSize`, `penOpacity`, `onStrokeComplete: (stroke: Stroke) => void`, `onStrokeRemove: (strokeId: string) => void`, `eraserSize`
  - Wire `useDrawing` hook from `src/hooks/use-drawing.ts` for pen pointer events
  - Render committed strokes using `renderStroke()` from `src/lib/canvas/stroke-utils.ts`
  - An interaction layer div (absolute inset-0) that captures pointer events when draw mode is active, with `pointerEvents: 'none'` when not in draw mode
  - Resize observer to match overlay dimensions to the editor content area

- [x] T004 [US1] Add drawing state management to `src/components/editor/tiptap-editor.tsx`:
  - State: `activeTool` (default `'text'`), `strokes` array, `undoStack`/`redoStack` refs (capped at 100)
  - `isDrawMode` derived from activeTool being `'pen'` | `'highlighter'` | `'eraser'`
  - `handleStrokeAdd` callback: adds stroke to state, pushes to undo stack, clears redo stack, triggers save
  - `handleStrokeRemove` callback: removes stroke from state, pushes to undo stack, triggers save
  - `getPagesData` callback: returns `{ mode: 'text-overlay', pages: [{ id, order: 0, strokes, textBoxes: [], flowContent: null }] }` per data-model.md
  - Pass `getPagesData` to `useDocumentSync` hook (it already accepts this optional callback)
  - On mount: if `document.pages` has `mode: 'text-overlay'`, load strokes from `pages.pages[0].strokes` into state
  - Render `<DrawingOverlay>` component over the editor content area, passing strokes and tool state
  - Set `editor.setEditable(!isDrawMode)` when mode changes so TipTap ignores input during drawing

- [x] T005 [US1] Add draw mode toggle button to `src/components/editor/editor-toolbar.tsx`:
  - Add new props to `EditorToolbarProps`: `isDrawMode: boolean`, `onToggleDrawMode: () => void`
  - Add a `ToolbarButton` with a pencil/draw icon (use `Pencil` from lucide-react) after the export PDF section, separated by `VerticalSeparator`
  - Button shows active state when `isDrawMode` is true
  - Clicking toggles between text mode and draw mode (pen tool as default draw tool)

- [x] T006 [US1] Wire stroke persistence and loading in `src/components/editor/tiptap-editor.tsx`:
  - Ensure `triggerSave()` from useAutoSave/useDocumentSync is called after every stroke add/remove
  - Add `onRemotePagesUpdate` handler to `useDocumentSync` — when remote pages update arrives with `mode: 'text-overlay'`, update local strokes state from the remote data
  - Verify the save flow works: draw strokes → debounced save → `updateDocumentContent(id, contentJson, pagesJson)` includes pages with `mode: 'text-overlay'`

**Checkpoint**: Users can toggle draw mode in a text doc, draw pen strokes, and strokes persist across reloads. Only pen tool with default settings.

---

## Phase 3: User Story 2 - Drawing Sub-Tools (Priority: P1)

**Goal**: Full drawing toolkit — pen, highlighter, eraser with color and size pickers — matching canvas document capabilities.

**Independent Test**: Activate draw mode, switch between pen/highlighter/eraser, change colors and sizes, verify each tool works correctly.

### Implementation for User Story 2

- [x] T007 [US2] Add pen/highlighter/eraser sub-tool buttons to `src/components/editor/editor-toolbar.tsx`:
  - Add new props: `drawTool: CanvasTool`, `onDrawToolChange: (tool: CanvasTool) => void`, `penColor`, `penSize`, `highlighterColor`, `highlighterSize`, `eraserSize`, `onPenColorChange`, `onPenSizeChange`, `onHighlighterColorChange`, `onHighlighterSizeChange`, `onEraserSizeChange`
  - When `isDrawMode` is true, render sub-tool buttons (Pen, Highlighter, Eraser) with active state tracking, similar to the canvas editor toolbar (see `src/components/canvas/canvas-editor.tsx` lines 1737-1789)
  - Use icons from lucide-react: `Pen`, `Highlighter`, `Eraser`

- [x] T008 [US2] Add color picker and size controls to `src/components/editor/editor-toolbar.tsx`:
  - When pen is active: show color palette (popover with color swatches from `PEN_COLORS`) and size selector (from `PEN_SIZES`) — reuse the pattern from EditorToolbar's existing HighlightButton color picker (lines 100-201)
  - When highlighter is active: show highlighter color palette and size selector using `HIGHLIGHTER_COLORS` and `HIGHLIGHTER_SIZES`
  - When eraser is active: show eraser size selector using `ERASER_SIZES`
  - Import all constants from `src/lib/canvas/drawing-constants.ts` (created in T002)

- [x] T009 [US2] Add pen/highlighter/eraser state management to `src/components/editor/tiptap-editor.tsx`:
  - State: `penColor`, `penSize`, `highlighterColor`, `highlighterSize`, `eraserSize` — initialize from shared constants defaults
  - Compute `penOpacity`: 1.0 for pen, ~0.4 for highlighter (match canvas-editor behavior)
  - Pass current tool's color/size/opacity to `<DrawingOverlay>`

- [x] T010 [US2] Wire eraser tool in `src/components/editor/drawing-overlay.tsx`:
  - Import and wire `useEraser` hook from `src/hooks/use-eraser.ts`
  - Pass `activeTool`, `eraserRadius`, `onStrokeRemove` callback, and `getPageStrokes` getter
  - When eraser is active, attach eraser pointer event handlers to the interaction layer instead of drawing handlers
  - Render eraser cursor circle (SVG circle overlay at pointer position, matching canvas-page.tsx layer 5 pattern)

- [x] T011 [US2] Wire highlighter tool in `src/components/editor/drawing-overlay.tsx`:
  - When `activeTool === 'highlighter'`, pass highlighter color, size, and opacity (~0.4) to `useDrawing` hook
  - The `useDrawing` hook already handles opacity via the stroke's `opacity` field — ensure highlighter strokes are rendered with correct transparency on the committed canvas

**Checkpoint**: Full drawing toolkit works in text documents — pen, highlighter, eraser with configurable colors and sizes.

---

## Phase 4: User Story 3 - Seamless Mode Switching (Priority: P2)

**Goal**: Fluid switching between text editing and drawing modes with no content loss, flicker, or misalignment.

**Independent Test**: Type text, switch to draw mode, draw strokes, switch back to text mode, continue typing — both text and strokes coexist correctly. Scroll and verify alignment.

### Implementation for User Story 3

- [x] T012 [US3] Polish mode switching in `src/components/editor/tiptap-editor.tsx`:
  - Ensure `editor.setEditable(true)` runs immediately when switching to text mode and `editor.setEditable(false)` when switching to draw mode — no delay or animation
  - Verify no layout shift occurs when switching modes (the DrawingOverlay's interaction layer should only change `pointerEvents`, not dimensions)
  - When switching from draw to text mode, ensure the committed canvas re-renders with all current strokes (no missing strokes from the working canvas)

- [x] T013 [US3] Ensure drawing overlay scrolls with text content in `src/components/editor/drawing-overlay.tsx`:
  - The overlay must be positioned within the scrollable container (not fixed to viewport)
  - Strokes should scroll with the text content naturally since they're absolutely positioned within the same scroll parent
  - Verify: if the overlay's parent is the scrollable editor container, strokes stay aligned with text as the user scrolls
  - Apply scroll lock (using `lockScroll()` from `src/lib/canvas/scroll-lock.ts`) during active drawing to prevent jittery strokes

- [x] T014 [US3] Add undo/redo keyboard handling for drawing actions in `src/components/editor/tiptap-editor.tsx`:
  - When `isDrawMode` is true, intercept Ctrl+Z / Cmd+Z to undo last drawing action (pop from undoStack, push to redoStack, remove/add stroke accordingly)
  - When `isDrawMode` is true, intercept Ctrl+Shift+Z / Cmd+Shift+Z to redo last drawing action
  - When `isDrawMode` is false, let TipTap handle undo/redo natively (no interception)
  - Update toolbar undo/redo button disabled state based on current mode's stack

**Checkpoint**: Mode switching is fluid, strokes stay aligned with text, undo/redo works per-mode.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, cleanup, and validation

- [x] T015 Handle edge case: first-time drawing initializes pages in `src/components/editor/tiptap-editor.tsx` — when `document.pages` is `null` and user completes first stroke, create the full pages structure `{ mode: 'text-overlay', pages: [{ id, order: 0, strokes: [stroke], textBoxes: [], flowContent: null }] }` and trigger save
- [x] T016 Handle edge case: empty strokes in `src/components/editor/tiptap-editor.tsx` — when all strokes are erased, keep `pages` set (don't reset to null) per data-model.md state transitions
- [x] T017 Verify existing text editor features still work: ensure EditorToolbar text formatting (bold, italic, lists, headings, etc.), math input, and PDF export are unaffected by the draw mode additions
- [x] T018 Run `pnpm lint` and `pnpm format:check` — fix any linting or formatting issues across all changed files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Phase 1 completion (routing fix + shared constants)
- **US2 (Phase 3)**: Depends on Phase 2 completion (drawing overlay and basic state must exist)
- **US3 (Phase 4)**: Depends on Phase 2 completion (needs basic drawing working); can run in parallel with Phase 3
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 1 — No dependencies on other stories
- **US2 (P1)**: Depends on US1 — extends the toolbar and overlay created in US1
- **US3 (P2)**: Depends on US1 — polishes mode switching behavior from US1. Can run in parallel with US2.

### Within Each Phase

```
Phase 1: T001 and T002 can run in parallel [P]
Phase 2: T003 first (creates the component), then T004+T005 in parallel, then T006
Phase 3: T007+T008 in parallel (toolbar changes), then T009, then T010+T011 in parallel
Phase 4: T012, T013, T014 can all run in parallel [P]
Phase 5: T015+T016 in parallel, then T017, then T018
```

### Parallel Opportunities

```
# Phase 1 — both tasks touch different files:
Task T001: page.tsx routing fix
Task T002: Extract drawing constants to new file

# Phase 2 — after T003 creates the overlay:
Task T004: tiptap-editor.tsx state management
Task T005: editor-toolbar.tsx draw toggle

# Phase 3 — toolbar additions:
Task T007: Sub-tool buttons
Task T008: Color/size controls

# Phase 3 — hook wiring (after T009):
Task T010: Eraser in drawing-overlay.tsx
Task T011: Highlighter in drawing-overlay.tsx

# Phase 4 — all touch different concerns:
Task T012: Mode switching polish
Task T013: Scroll alignment
Task T014: Undo/redo keyboard handling
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001-T002)
2. Complete Phase 2: US1 — Draw on Text Documents (T003-T006)
3. **STOP and VALIDATE**: Open a text doc, draw strokes, reload — strokes persist
4. Deploy/demo if ready — basic drawing works

### Incremental Delivery

1. Phase 1 → Routing and constants ready
2. Phase 2 (US1) → Basic pen drawing works → **MVP**
3. Phase 3 (US2) → Full toolkit (pen/highlighter/eraser/colors/sizes)
4. Phase 4 (US3) → Polished mode switching, scroll alignment, undo/redo
5. Phase 5 → Edge cases and cleanup

---

## Notes

- No database migration needed — uses existing `pages` JSONB column
- No new npm dependencies — reuses `perfect-freehand`, Canvas 2D API, existing hooks
- US1 and US2 are both P1 but US2 extends US1's components, so US1 must complete first
- US3 can start after US1, in parallel with US2
- The `mode: 'text-overlay'` marker in pages JSON is the key discriminator preventing text docs from being routed to CanvasEditor
