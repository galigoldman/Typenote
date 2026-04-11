# Implementation Plan: Fix Cross-Page Text Editing Flow

**Branch**: `037-fix-cross-page-editing` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/037-fix-cross-page-editing/spec.md`

## Summary

Fix Enter and Backspace at page boundaries so the multi-page text editor behaves like a single continuous document. Enter at the bottom of a page currently moves only the cursor (text stays behind) because `canvas-page.tsx` intercepts the keystroke before TipTap processes it. Backspace-at-start currently works but loses text formatting. The fix removes the legacy Enter interception so the existing overflow cascade handles it correctly, and improves Backspace to preserve inline marks.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror)
**Storage**: N/A — purely client-side editor change, no database changes
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Cursor placement must feel instantaneous (same frame as Enter keypress)
**Constraints**: Must not break existing overflow cascade, drawing, or PDF background features
**Scale/Scope**: 3 files modified, ~50 lines changed, ~100 lines of new tests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                            |
| ------------------------------- | ------ | ---------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix on existing infrastructure, no new features              |
| II. Test-Driven Quality         | PASS   | Plan includes unit tests and E2E tests                           |
| III. Protected Branches         | PASS   | Working on feature branch `037-fix-cross-page-editing` off `dev` |
| IV. Migrations as Code          | N/A    | No database changes                                              |
| V. Interview-Ready Architecture | PASS   | Will document reasoning for approach                             |

No violations. Gate passed.

## Root Cause Analysis

### Enter Bug — "Cursor moves, text stays"

**Three-layer failure chain**:

1. **canvas-page.tsx `handleKeyDown` (lines 346-365)**: When `cursorY > PAGE_HEIGHT - 60`, calls `event.preventDefault()` — blocks TipTap from processing the Enter keystroke entirely.

2. **canvas-page.tsx `onUpdate` rAF (lines 441-587)**: The overflow detection runs inside `onUpdate`, which only fires when the document changes. Since `preventDefault()` blocked Enter, no content change occurs, so `onUpdate` never fires.

3. **canvas-editor.tsx `focusPage` (lines 932-938)**: The "legacy navigate" path is triggered with `null` content. Cursor moves to next page, but no text is moved.

**Fix**: Remove the early Enter interception. Let TipTap process Enter normally → `onUpdate` fires → overflow cascade runs → cursor follows text via `decideCursorTarget`.

### Backspace Bug — "Formatting lost on merge"

**Current implementation** (canvas-editor.tsx lines 1339-1397):

- Extracts only `.text` from first block's JSON, discarding bold/italic/link marks
- Uses `insertContentAt(position, plainText)` instead of inserting the full inline node array

**Fix**: Extract the full `content` array (with marks preserved) and insert it using TipTap's content insertion API.

## Implementation Strategy

### Phase 1: Fix Enter Overflow (FR-001, FR-003, FR-005)

**File: `src/components/canvas/canvas-page.tsx`**

Remove the `handleKeyDown` Enter interception block (lines 346-365). This is the "legacy navigate" path that:

- Intercepts Enter when cursor Y is near the page bottom
- Calls `event.preventDefault()` (blocks TipTap)
- Calls `onTextOverflow(pageId, null)` (navigates cursor without content)

**After removal**: Enter is processed normally by TipTap → new paragraph created → if it overflows the page, the existing `onUpdate` rAF overflow detection fires → `handleTextBoxOverflow` in canvas-editor.tsx extracts and cascades the content → `decideCursorTarget` places cursor correctly.

**Risk**: Brief visual flash of overflowing content before rAF extracts it. Likely imperceptible (single frame). Verify during testing.

### Phase 2: Fix Backspace Formatting Preservation (FR-002)

**File: `src/components/canvas/canvas-editor.tsx`**

In `handleBackspaceAtStart` (lines 1339-1397):

1. Instead of extracting plain text:

   ```typescript
   // BEFORE (loses formatting):
   const firstBlockText =
     firstBlockJSON.content?.map((n) => n.text ?? '').join('') ?? '';
   ```

2. Extract the full inline content array (preserves marks):

   ```typescript
   // AFTER (preserves formatting):
   const firstBlockContent = firstBlockJSON.content || [];
   ```

3. Use `insertContent` with the proper inline node format instead of plain text insertion.

### Phase 3: Clean Up Legacy Navigate Path (FR-003)

**File: `src/components/canvas/canvas-editor.tsx`**

After removing the Enter interception, the "legacy navigate" path in `focusPage` (the `else if (!overflowContent)` branch, lines 932-938) becomes dead code. Remove it to simplify the codebase.

Also remove the `handleTextOverflow` handling of the `null` content case from canvas-editor.tsx, since nothing will call it with null content anymore.

### Phase 4: E2E Tests (FR-001 through FR-007)

**File: `e2e/canvas-editor-cursor-cascade.spec.ts`**

Add tests for:

1. Enter at last line pushes text + cursor to next page
2. Enter in middle of last line splits text correctly
3. Backspace at start of page 2 merges with page 1
4. Backspace at start of page 1 does nothing
5. Continuous typing across page boundary flows naturally
6. Multi-page cascade preserves all content

### Phase 5: Verify No Regressions

Run full test suite:

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

Verify manually:

- Drawing on pages still works
- User-positioned text boxes unaffected
- PDF backgrounds render correctly
- Undo/redo works within pages

## Project Structure

### Documentation (this feature)

```text
specs/037-fix-cross-page-editing/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # No changes needed
├── quickstart.md        # Setup and testing guide
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
src/components/canvas/
├── canvas-page.tsx      # Remove Enter interception in handleKeyDown
├── canvas-editor.tsx    # Fix Backspace formatting, clean up legacy navigate
└── text-box.tsx         # No changes needed

e2e/
└── canvas-editor-cursor-cascade.spec.ts  # Add Enter/Backspace E2E tests
```

**Structure Decision**: No new files. All changes are modifications to existing canvas editor components.

## Interview Concepts

This fix touches several concepts commonly discussed in software engineering interviews:

- **Event propagation and `preventDefault()`**: Understanding how browser event handling interacts with framework (TipTap/ProseMirror) event handling. The bug was caused by intercepting a keystroke too early in the pipeline.

- **Architectural layering**: The editor has three layers (key handler → TipTap → overflow cascade). The bug occurred because Layer 1 short-circuited Layers 2 and 3.

- **Observer pattern**: The overflow cascade uses ResizeObserver + requestAnimationFrame to detect and handle content overflow asynchronously.

- **State machine coordination**: Cursor placement during cascade uses a "move-first" strategy — place the cursor synchronously, then let the cascade run in the background. This prevents visual flickering.
