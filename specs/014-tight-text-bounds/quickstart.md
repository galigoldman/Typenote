# Quickstart: Tight Text Selection Bounds

## What This Feature Does

Changes text box selection in the canvas editor to use tight bounds around actual rendered text content, instead of the full container width. This affects:

- Rectangle selection (drawing a selection box)
- Single-tap selection
- Selection highlight/border visual

Resize handles remain at container bounds (unchanged).

## Files to Modify

1. **`src/types/canvas.ts`** — Add optional `contentBounds` property to `TextBox` interface
2. **`src/components/canvas/text-box.tsx`** — Measure content bounds in ResizeObserver callback
3. **`src/components/canvas/canvas-page.tsx`** — Add `onContentBoundsMeasured` callback prop
4. **`src/components/canvas/canvas-editor.tsx`** — Handle `contentBounds` state updates
5. **`src/hooks/use-selection.ts`** — Update `getSelectableBBox()` to use `contentBounds`
6. **`src/components/canvas/selection-overlay.tsx`** — Use tight bounds for selection highlight (if needed beyond what `getSelectableBBox` provides)

## How to Test

1. `pnpm dev` — start the dev server
2. Open a document, switch to canvas mode
3. Create a text box with short text (e.g., "hello")
4. Switch to Select mode
5. Draw a selection rectangle over the empty right side of the text box container — it should NOT select the text box
6. Draw a selection rectangle over the actual text — it should select the text box
7. Verify the selection highlight wraps tightly around the text
8. Test with RTL text (Hebrew characters)
9. Test with empty text boxes
10. Test with multi-line text of varying widths

## Key Design Decisions

- **Range API for measurement**: Content width measured via `Range.getBoundingClientRect()` on ProseMirror block children — no layout thrash
- **Transient state**: `contentBounds` is computed client-side, NOT persisted to database
- **Same observer**: Piggybacks on existing ResizeObserver (no new observer lifecycle)
- **Resize untouched**: Resize handles stay at container bounds per clarification
