# Research: Fix Paste Content Page Splitting

## Root Cause Analysis

### How overflow detection currently works

In `canvas-page.tsx` (lines 426–518), the `onUpdate` TipTap callback schedules a `requestAnimationFrame` that:

1. Reads the **cursor position** via `ed.view.coordsAtPos(ed.state.selection.from)`
2. If `cursorY > PAGE_HEIGHT` (1123px), enters split logic
3. Sets `overflowNotifiedRef.current = true` — a **hysteresis gate** that prevents re-triggering
4. **Multi-block case**: extracts only the **last block** (`doc.lastChild`) and sends it to the next page
5. **Single-block case**: finds a word boundary near `PAGE_HEIGHT - 20` and splits the paragraph there
6. The gate only resets when `cursorY < PAGE_HEIGHT - 100`

### Why typing works (mostly)

When the user types, the cursor is always at the insertion point (typically the bottom). So:

- Cursor passes PAGE_HEIGHT → overflow detected
- Last block extracted → cursor is now on new page
- Gate locks on old page → no further splits needed (only one block overflowed)

### Why paste fails — three compounding issues

**Issue 1: Cursor position vs. content height**
After paste, TipTap inserts content at the cursor position. If pasting at the end, the cursor ends up somewhere in the middle or end of the pasted content. The `onUpdate` handler checks `selection.from` — but when `focusPage` calls `editor.commands.focus('start')` on the next page, the cursor moves to position 1 (top of page). Even if the next page overflows, the cursor is at the top, so `cursorY` is small and no overflow is detected.

**Issue 2: Only one block extracted per overflow event**
The multi-block case extracts only `doc.lastChild`. If pasting 50 paragraphs, only the last paragraph is moved to the next page. The remaining 48+ paragraphs still overflow the current page. But the hysteresis gate is now locked (`overflowNotifiedRef = true`), preventing further splits.

**Issue 3: Hysteresis gate blocks cascade**
After the first split, `overflowNotifiedRef` is set to `true`. It only resets when the cursor moves back to `cursorY < PAGE_HEIGHT - 100`. Since the cursor is sent to the next page via `focus('start')`, the gate on the original page stays locked forever (until the user manually types near the bottom again).

### Fix Strategy

**Fix 1 — Measure content bottom, not cursor position**
Replace `coordsAtPos(ed.state.selection.from)` with a measurement of the **last position in the document** (`doc.content.size`). This detects overflow regardless of cursor placement.

**Fix 2 — Extract ALL overflowing blocks at once**
Instead of extracting just `doc.lastChild`, iterate blocks from the top to find the **first block whose bottom edge exceeds PAGE_HEIGHT**. Extract that block and all subsequent blocks. This handles the entire overflow in one operation.

**Fix 3 — Allow cascade by resetting the gate**
After sending overflow to the next page, reset `overflowNotifiedRef` on the current page (it's now within bounds). The next page, upon receiving content via `setContent`, fires its own `onUpdate`. With Fix 1, overflow is detected even with cursor at position 1, enabling natural cascade.

### Cascade Performance

Each cascade step requires: React render → editor mount → setContent → onUpdate → RAF → overflow detection. Estimated ~100–200ms per page. For 10 pages, ~1–2 seconds total. Meets SC-003 (2 seconds).

### Undo Behavior

TipTap's undo is per-editor instance. In text mode, `handleUndo` delegates to `activeEditor.chain().focus().undo().run()`. This undoes the paste on the current page but does NOT remove pages created during overflow or content pushed to other pages. This is the same limitation that exists for typing-based page splits today. True cross-page atomic undo would require a custom undo system outside TipTap, which is out of scope for this bug fix.

### Alternatives Considered

| Approach                            | Pros                                                   | Cons                                                                                                   | Decision                                                     |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Custom `handlePaste` pre-processing | Could pre-split before insertion                       | Can't measure rendered heights before rendering; complex HTML parsing                                  | Rejected — measurement requires rendered DOM                 |
| Bulk pre-computation in parent      | Avoids cascade entirely                                | Requires height estimation without rendering; blocks can have variable heights (headings, lists, math) | Rejected — inaccurate without rendering                      |
| Fix overflow detection + cascade    | Minimal code changes, reuses existing split logic      | Cascade is sequential (not instant)                                                                    | **Chosen** — simplest, most reliable, acceptable performance |
| Off-screen measurement              | Render content in hidden container, measure, pre-split | Complex setup, flicker risk, memory overhead                                                           | Rejected — over-engineered                                   |
