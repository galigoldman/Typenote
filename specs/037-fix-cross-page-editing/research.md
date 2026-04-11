# Research: Fix Cross-Page Text Editing Flow

**Feature**: 037-fix-cross-page-editing
**Date**: 2026-04-11

## Research Task 1: Why Does Enter Move Only the Cursor?

### Decision: Remove the Legacy Enter Interception in canvas-page.tsx

### Rationale

The root cause is a three-layer failure:

1. **canvas-page.tsx (lines 346-365)** — `handleKeyDown` intercepts Enter when `cursorY > PAGE_HEIGHT - 60`. It calls `event.preventDefault()`, which **blocks TipTap from ever processing the keystroke**. No content change occurs.

2. **canvas-page.tsx (onUpdate rAF, lines 441-587)** — The overflow detection runs inside `onUpdate`, which only fires when the document changes. Since `preventDefault()` blocked the Enter, `onUpdate` never fires, and overflow detection never runs.

3. **canvas-editor.tsx (focusPage, lines 932-938)** — The "legacy navigate" path is triggered because `onTextOverflow(pageId, null)` was called with null content. It moves the cursor to the next page but doesn't move any text.

**The fix**: Remove (or bypass) the early `handleKeyDown` Enter interception. Let TipTap process Enter normally, creating a new paragraph. The existing `onUpdate` rAF overflow detection will then fire, extract the overflowing content, and cascade it to the next page. The `decideCursorTarget` logic from `cursor-target.ts` will handle cursor placement.

### Alternatives Considered

1. **Keep the interception but also extract content**: Would require duplicating the overflow extraction logic inside `handleKeyDown`, adding complexity with no benefit since the `onUpdate` path already does this correctly.

2. **Move Enter handling entirely to canvas-editor.tsx**: Would require rearchitecting the per-page editor boundary, unnecessary when the existing overflow cascade already works.

## Research Task 2: Current Backspace-at-Start Limitations

### Decision: Fix Backspace to Preserve Formatting via Node Merging

### Rationale

The current `handleBackspaceAtStart` (canvas-editor.tsx lines 1339-1397) has several issues:

1. **Loses formatting**: Extracts only `.text` from JSON content, discarding bold/italic/link marks. This means merging a bold paragraph into the previous page loses the bold styling.

2. **Plain text insertion**: Uses `insertContentAt(position, plainText)` instead of inserting the actual ProseMirror node content.

3. **No E2E tests**: The test file explicitly notes that Backspace is "tested manually" due to Playwright cursor sync issues.

**The fix**: Instead of extracting plain text, extract the ProseMirror JSON `content` array (which preserves inline marks) and use `insertContent` with the proper node format. Alternatively, use ProseMirror's `tr.replaceWith()` to merge nodes at the document level.

### Alternatives Considered

1. **Merging at the ProseMirror transaction level**: More correct but requires deeper ProseMirror knowledge. The TipTap command API is sufficient for now if we pass the full inline content array instead of plain text.

2. **Using TipTap's `mergeBlocks` extension**: Doesn't exist as a standalone API — would need custom ProseMirror plugin code.

## Research Task 3: Cascade Interaction with Enter Fix

### Decision: The Existing Cascade System Handles This Correctly

### Rationale

The overflow cascade system (handleTextBoxOverflow, lines 1145-1326) already:
- Detects overflow via ResizeObserver and rAF
- Finds the split point (block-level or word-boundary)
- Extracts overflowing content as JSON
- Prepends it to the next page's -ftb text box
- Uses `cascadeTargetTextBoxIds` to suppress intermediate focus changes
- Uses `decideCursorTarget` to compute whether cursor stays or moves

Once we remove the early Enter interception, Enter will create content → `onUpdate` fires → overflow detected → cascade runs → cursor follows. No changes needed to the cascade system itself.

### Key Risk

Removing the Enter interception may cause a brief visual flash where the page shows overflowing content before the rAF callback extracts it. This is likely imperceptible (single frame) but should be verified during testing.
