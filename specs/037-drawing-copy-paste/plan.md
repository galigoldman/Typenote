# Implementation Plan: Drawing Copy/Paste

**Branch**: `037-drawing-copy-paste` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/037-drawing-copy-paste/spec.md`

## Summary

Add drawing copy/paste to the canvas editor. Users select strokes/text boxes, copy via action bar button (or Cmd/Ctrl+C), then paste via pen long-press in select mode (or Cmd/Ctrl+V on desktop). Pasted elements are full editable clones with unique IDs, auto-selected after paste, and undoable as a single step.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror), perfect-freehand
**Storage**: N/A — no database changes, client-side only
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: iPad with Apple Pencil (primary), Desktop browser (secondary)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: 60fps canvas rendering maintained during paste, <100ms paste response
**Constraints**: No new dependencies. Paste exclusive to select mode (no shape snap conflict).
**Scale/Scope**: Single document scope, in-memory clipboard

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Incremental Development | PASS | Pure client-side feature, no DB infrastructure needed. Built in phases: copy → paste → keyboard → visual feedback. |
| II. Test-Driven Quality | PASS | Unit tests for clipboard logic, E2E for full user flow. No integration tests needed (no DB). |
| III. Protected Branches | PASS | On feature branch `037-drawing-copy-paste`, will PR to `dev`. |
| IV. Migrations as Code | N/A | No schema changes. |
| V. Interview-Ready Architecture | PASS | Documents: clipboard data structure design, undo system integration, pointer event state machine, pen input discrimination. |

**Post-Phase 1 Re-check**: All gates still pass. No new dependencies, no DB changes, no infrastructure additions.

## Project Structure

### Documentation (this feature)

```text
specs/037-drawing-copy-paste/
├── plan.md              # This file
├── research.md          # Phase 0 output — technical decisions
├── data-model.md        # Phase 1 output — ClipboardData, PasteCanvasAction
├── quickstart.md        # Phase 1 output — key files and decisions
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── hooks/
│   └── use-selection.ts          # MODIFY: add clipboard ref, copy(), long-press detection, paste()
├── components/canvas/
│   ├── canvas-editor.tsx          # MODIFY: add 'paste' CanvasAction, keyboard shortcuts, undo/redo
│   ├── canvas-page.tsx            # MODIFY: add Copy button to floating action bar, render paste indicator
│   └── paste-indicator.tsx        # NEW: SVG expanding circle overlay for long-press feedback
└── types/
    └── canvas.ts                  # MODIFY: add ClipboardData interface, extend CanvasAction union

__tests__/
└── hooks/
    └── use-selection-clipboard.test.ts  # NEW: unit tests for clipboard/paste logic

e2e/
└── drawing-copy-paste.spec.ts    # NEW: E2E tests for full copy/paste flow
```

**Structure Decision**: All changes fit within the existing project structure. One new component (`paste-indicator.tsx`), one new test file each for unit and E2E. No new directories needed.

## Implementation Phases

### Phase 1: Copy Action (P1 — User Story 1)

**Goal**: Add Copy button to selection action bar and internal clipboard.

**Changes**:
1. **`src/types/canvas.ts`** — Add `ClipboardData` interface:
   ```
   { strokes: Stroke[], textBoxes: TextBox[], originX: number, originY: number, sourcePageId: string }
   ```
2. **`src/hooks/use-selection.ts`** — Add:
   - `clipboardRef: useRef<ClipboardData | null>(null)` — persists across re-renders
   - `copySelection()` function — deep-clones selected strokes/text boxes, computes origin center from selection bbox, stores in clipboardRef
   - Expose `copySelection` and `hasClipboardData` (derived boolean) from hook
3. **`src/components/canvas/canvas-page.tsx`** — Add Copy button (clipboard icon) to the floating action bar, between Ask AI and Delete. Shows "Copied!" toast for 1500ms.

**Tests**: Unit test for `copySelection` logic (cloning, origin computation). E2E test for copy button visibility and feedback.

### Phase 2: Paste via Pen Long-Press (P1 — User Story 2)

**Goal**: Detect pen long-press in select mode and paste clipboard contents.

**Changes**:
1. **`src/types/canvas.ts`** — Extend `CanvasAction` union with:
   ```
   { type: 'paste', pageId: string, strokes: Stroke[], textBoxes: TextBox[] }
   ```
2. **`src/hooks/use-selection.ts`** — Add long-press detection:
   - On `handlePointerDown` in select mode, if pen input on empty space and clipboard has data:
     - Start 500ms timer (`longPressTimerRef`)
     - Track press position (`longPressOriginRef`)
   - On `handlePointerMove`: if pen moves >5px from origin, cancel timer, fall through to normal selection
   - On timer fire: execute paste — generate new IDs, offset positions from clipboard origin to press location, add to page, push 'paste' CanvasAction to undo stack, auto-select pasted elements
   - On `handlePointerUp`: cancel timer if still pending
3. **`src/components/canvas/canvas-editor.tsx`** — Add undo/redo handlers for 'paste' action type:
   - Undo: remove all strokes/text boxes in the action from the page
   - Redo: re-add them all

**Tests**: Unit tests for position offset calculation, ID generation, undo action creation. E2E test for full long-press paste flow.

### Phase 3: Keyboard Copy/Paste (P2 — User Story 3)

**Goal**: Cmd/Ctrl+C and Cmd/Ctrl+V for desktop.

**Changes**:
1. **`src/components/canvas/canvas-editor.tsx`** — Add `useEffect` with window keydown listener:
   - `Cmd/Ctrl+C` when `activeTool === 'select'` and selection exists → call `copySelection()`
   - `Cmd/Ctrl+V` when clipboard has data → paste at viewport center (compute center from scroll position + viewport dimensions)
   - `e.preventDefault()` to block browser default paste

**Tests**: E2E test for keyboard shortcut flow on desktop viewport.

### Phase 4: Visual Long-Press Feedback (P2 — User Story 4)

**Goal**: Show expanding circle during long-press to indicate paste is imminent.

**Changes**:
1. **`src/components/canvas/paste-indicator.tsx`** — New component:
   - SVG `<circle>` with CSS animation: grows from r=0 to r=20 over 500ms
   - Semi-transparent fill (e.g., blue with 20% opacity)
   - Props: `x`, `y`, `isVisible`
   - Fades out on cancel (pen lift before 500ms)
2. **`src/hooks/use-selection.ts`** — Expose `longPressIndicator: { x: number, y: number, isVisible: boolean }` state for the indicator position
3. **`src/components/canvas/canvas-page.tsx`** — Render `<PasteIndicator>` in the SVG overlay layer (alongside selection overlay)

**Tests**: E2E test verifying indicator appears during long-press and disappears on cancel.

## Key Technical Decisions

### Why internal clipboard (not OS clipboard)?
Stroke data includes point arrays, bounding boxes, opacity, and color — serializing to OS clipboard and back would be lossy or require a custom MIME type. An in-memory ref is simpler and preserves full fidelity. Trade-off: can't paste across browser tabs or apps.

### Why compound 'paste' undo action?
The user explicitly requested that undo removes "only the last pasted item." If we pushed individual stroke-add actions, undo would remove strokes one at a time. A compound action groups all pasted elements into one undo step.

### Why delay 'drawing' state entry for long-press?
In select mode, pointerDown on empty space normally starts lasso/rect selection ('drawing' state). For long-press, we need a ~500ms window before committing to selection. If the pen moves >5px during that window, we cancel and enter 'drawing' as normal. This is the minimal change to the existing state machine.

### Why pen-only for long-press paste?
Touch input is already filtered out in select mode (`pointerType === 'touch'` → early return). For long-press specifically, we additionally filter mouse to avoid accidental right-click or slow-click pastes on desktop. Desktop users use Cmd/Ctrl+V instead.

## Complexity Tracking

No constitution violations. No complexity justification needed.
