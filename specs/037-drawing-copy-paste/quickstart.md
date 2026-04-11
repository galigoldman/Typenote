# Quickstart: Drawing Copy/Paste

**Feature**: 037-drawing-copy-paste
**Date**: 2026-04-10

## What This Feature Does

Adds the ability to copy selected drawings (strokes and text boxes) and paste them at a new location on the canvas. Copy via action bar button or Cmd/Ctrl+C. Paste via pen long-press (iPad) or Cmd/Ctrl+V (desktop).

## Key Files to Modify

| File                                      | Change                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `src/hooks/use-selection.ts`              | Add long-press detection, clipboard ref, copy/paste logic              |
| `src/components/canvas/canvas-editor.tsx` | Add 'paste' CanvasAction type, keyboard shortcuts, undo/redo for paste |
| `src/components/canvas/canvas-page.tsx`   | Add Copy button to floating action bar, render paste indicator         |
| `src/types/canvas.ts`                     | Add ClipboardData type and 'paste' action variant to CanvasAction      |

## Key Files to Create

| File                                        | Purpose                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `src/components/canvas/paste-indicator.tsx` | SVG circle overlay during long-press (visual feedback) |

## Architecture Decisions

1. **Clipboard is a React ref** — not state, not OS clipboard. Avoids re-renders, preserves full object fidelity.
2. **Paste is select-mode only** — no conflict with shape snap (circle/line) which uses long-press during drawing.
3. **Compound undo action** — single 'paste' action type holds all pasted elements, so undo removes the whole paste at once.
4. **Pen-only long-press** — touch input is already filtered out in select mode. Long-press timer only starts for `pointerType === 'pen'`.

## Testing Strategy

- **Unit tests**: Clipboard data structure cloning, position offset calculations, undo action creation
- **E2E tests**: Full copy/paste flow — draw strokes, select, copy, long-press paste, verify pasted elements are editable
- **No integration tests**: No database or API involvement
