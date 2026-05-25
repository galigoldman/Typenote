# Research: Fix Image Paste Target & Cross-Page Object Movement

## Decision 1: Page Detection for Paste — Use Closest Page to Viewport Center

**Decision**: Replace the first-page fallback with a "closest page to viewport center" algorithm.

**Rationale**: The current code at `canvas-editor.tsx:2339-2343` falls back to `pageEls[0]` when no page exactly intersects the viewport center. This happens when the user scrolls to a position where the center falls between pages (in the gap). The "closest page" approach is more robust because:

- It always picks the page the user is looking at
- It works regardless of zoom level or gap size
- It degrades gracefully (worst case: picks the nearest visible page)

**Alternatives considered**:

- **Use `activePageIdRef`**: Rejected because this ref tracks the last _selected_ page, not necessarily the one the user is viewing. A user may scroll to a different page without selecting anything.
- **Only paste if exact intersection**: Rejected because it would silently fail in edge cases, confusing the user.
- **Track a separate "current page" state**: Over-engineering for this use case. The viewport detection is already close to working — it just needs a better fallback.

## Decision 2: Cross-Page Drag — Detect Boundary Crossing During Drag Commit

**Decision**: At drag commit (pointer up), check if any selected objects have coordinates outside `[0, PAGE_HEIGHT]`. If so, compute the target page and transfer objects.

**Rationale**: Checking at commit time (not during drag) keeps the real-time drag performance unchanged. The visual drag already lets objects appear to move past page edges because the page container doesn't clip. At commit we just need to:

1. Calculate the new Y position for each object
2. If `newY > PAGE_HEIGHT` → move to next page, adjust `Y -= PAGE_HEIGHT`
3. If `newY < 0` → move to previous page, adjust `Y += PAGE_HEIGHT`

**Alternatives considered**:

- **Real-time cross-page rendering during drag**: Would require rendering objects on two pages simultaneously during drag. Complex and likely jittery. Rejected.
- **Snap-to-page on hover**: Would require tracking which page the pointer is over during drag and splitting the selection. Over-complex for v1.

## Decision 3: Cross-Page Undo — New Compound Action Type

**Decision**: Add a `cross-page-move` undo action type that stores source page, target page, object IDs, and displacement.

**Rationale**: The undo system already handles single-page moves via `image-move`. A cross-page move requires removing objects from the source page AND adding them to the target page. A single compound action ensures one Ctrl+Z restores the original state.

**Alternatives considered**:

- **Two separate undo actions (remove + add)**: Would require the user to undo twice and could leave objects in an inconsistent state if only one undo is performed. Rejected.
- **Generic "batch" undo wrapper**: Over-engineering. A dedicated action type is simpler and explicit.

## Decision 4: Internal Cut/Paste — Use Existing Clipboard with Viewport Detection

**Decision**: Cut removes objects and stores them in `clipboardRef`. Paste uses the same viewport detection (now fixed) to determine the target page.

**Rationale**: The internal clipboard (`ClipboardData`) already stores `sourcePageId`. The paste handler already computes target page from viewport position. Once the viewport detection is fixed (Decision 1), cut/paste across pages will work naturally.

**Alternatives considered**:

- **Custom cut/paste flow separate from existing clipboard**: Rejected — unnecessary duplication.

## Decision 5: New Page Creation on Drag Past Last Page

**Decision**: When objects are dragged below the last page, reuse the existing `createEmptyPage()` function to add a new page before transferring objects.

**Rationale**: `handleImageAdd` already creates a new page when adding content to the last page. The same pattern applies to cross-page drag.

## Key Technical Facts

| Aspect                   | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| Page dimensions          | 794 x 1123 px (A4 @ 96 DPI)                                 |
| Object coordinates       | Page-relative (0,0 = top-left)                              |
| Undo stack limit         | 100 actions                                                 |
| Existing undo for moves  | `image-move` only; strokes and text boxes have NO move undo |
| Image processing         | Max 1200px, JPEG 80% quality                                |
| Paste handler location   | `canvas-editor.tsx:2283-2389`                               |
| Bug location             | `canvas-editor.tsx:2339-2343` (first-page fallback)         |
| Drag commit location     | `use-selection.ts:962-1043`                                 |
| Active page tracking     | `activePageIdRef` in `use-selection.ts:244`                 |
| Selection constraint     | Single-page only (`selectionPageId`)                        |
| Existing image E2E tests | None                                                        |
