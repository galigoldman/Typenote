# Research: Drawing Copy/Paste

**Feature**: 037-drawing-copy-paste
**Date**: 2026-04-10

## 1. Undo System Integration

**Decision**: Reuse existing `CanvasAction` pattern with a new compound `'paste'` action type.

**Rationale**: The canvas uses a simple ref-based undo stack (`undoStackRef` / `redoStackRef`, max 100 entries) with a `CanvasAction` discriminated union. Each action knows how to reverse itself. For paste, we need a single undo step that removes all elements from one paste operation. Adding a `'paste'` action type that holds arrays of strokes and text boxes lets undo remove them all at once while keeping it as one stack entry.

**Alternatives considered**:
- Push individual `stroke-add` / `textbox-add` per element: rejected because undo would remove them one-by-one, not as a group. User explicitly wants "remove only the last pasted item."
- Wrap in a `'batch'` action: over-engineered for a single use case. A dedicated `'paste'` type is clearer.

## 2. Long-Press Detection in Select Mode

**Decision**: Add a timer-based long-press detector inside `use-selection.ts` (or a new companion hook) that starts on `pointerDown` in select mode on empty space, cancels on movement >5px or `pointerUp`, and fires paste at 500ms.

**Rationale**: The select mode already filters out `pointerType === 'touch'` (finger input never enters selection logic). On `pointerDown` with pen/mouse on empty space, the hook currently starts a 'drawing' state for lasso/rect selection. We can delay entering 'drawing' state by introducing a brief "pending" phase where the long-press timer runs. If the timer fires (500ms, no movement), paste executes. If the pen moves >5px, cancel timer and fall through to normal selection behavior.

**Alternatives considered**:
- Separate `use-long-press.ts` hook: adds indirection. Since long-press only matters in select mode and interacts with selection state, keeping it co-located is simpler.
- Using `pointerType === 'pen'` filter for paste only: the spec says pen-only for long-press paste, but desktop users use Cmd+V instead. Since select mode already filters touch, and mouse long-press is uncommon, filtering pen-only for the long-press timer is correct.

## 3. Clipboard Data Structure

**Decision**: In-memory React ref (`useRef`) holding deep-cloned stroke and text box data, anchored to the center of the original selection bounding box.

**Rationale**: The clipboard must survive across React re-renders and page navigation within a document, but clear on document switch. A ref is ideal — no unnecessary re-renders, persists across component updates, and can be cleared in a `useEffect` cleanup when the document ID changes.

**Alternatives considered**:
- React state (`useState`): triggers re-renders on copy, unnecessary.
- Context/global store: over-engineered for single-component scope.
- OS clipboard (`navigator.clipboard`): can't preserve full object fidelity (stroke points, bbox, etc.) and would require serialization/deserialization.

## 4. Keyboard Shortcut Pattern

**Decision**: Add `Cmd/Ctrl+C` and `Cmd/Ctrl+V` handlers as a new `useEffect` in `canvas-editor.tsx`, following the existing pattern (window-level `keydown` listener).

**Rationale**: The codebase already uses this pattern for `Cmd+S` (save) and `Delete/Backspace` (delete selection). Adding two more shortcuts in the same style keeps the code consistent. The handler checks `activeTool === 'select'` and whether a selection exists before acting.

**Alternatives considered**:
- ProseMirror plugin: only for TipTap text editor, not canvas.
- Custom hook: unnecessary abstraction for two simple shortcuts.

## 5. Shape Snap Conflict Resolution

**Decision**: No conflict — paste is exclusive to select mode. Shape snap only fires in pen/highlighter mode during active drawing.

**Rationale**: The shape snap long-press (400ms) runs inside `use-drawing.ts` and only when `activeTool === 'pen'` or `activeTool === 'highlighter'` with an active stroke in progress (`isDrawingRef.current === true`). Paste long-press runs inside `use-selection.ts` when `activeTool === 'select'`. The two features operate in mutually exclusive tool states. No guard code needed — the tool mode check is sufficient.

## 6. Visual Feedback Component

**Decision**: Lightweight SVG circle overlay that grows from 0 to target radius over 500ms, rendered inside the canvas page SVG layer.

**Rationale**: The canvas already renders SVG overlays for selection (dashed rectangle, resize handles) via `selection-overlay.tsx`. Adding a paste indicator as another SVG element keeps rendering consistent and avoids DOM layering issues. CSS animation handles the growth/pulse.

**Alternatives considered**:
- Canvas 2D drawing: would require manual animation loop, more complex.
- HTML overlay: z-index and positioning complexity with the SVG canvas.
