# Research: Enable Draw Mode in Text Documents

**Feature**: 025-doc-draw-mode
**Date**: 2026-03-24

## Decision 1: Approach — Overlay vs. Convert to Canvas

**Decision**: Add a drawing canvas overlay on top of the TipTap editor, rather than converting text documents to full canvas documents.

**Rationale**:

- Canvas documents use paginated A4 pages with per-page text boxes — fundamentally different from the scrolling TipTap editor experience.
- Converting text docs to canvas format would break the text editing UX.
- An overlay preserves the existing text editing workflow while adding drawing capability.
- The `useDocumentSync` hook already accepts an optional `getPagesData` callback, making it straightforward to persist strokes from the TipTap editor.

**Alternatives considered**:

- **Route text docs through CanvasEditor**: Rejected — would require paginating a continuous TipTap document into A4 pages, breaking the scrolling text editing experience.
- **Convert document type on draw activation**: Rejected — destructive to the user's document format; not easily reversible.

## Decision 2: Stroke Storage — Reuse `pages` JSONB

**Decision**: Store drawing strokes in the existing `pages` JSONB column using a single `CanvasPage` entry (no pagination). Text content remains in the `content` field.

**Rationale**:

- The `pages` column already exists on all documents (nullable JSONB).
- `updateDocumentContent()` already supports setting `pages` alongside `content` — no server-side changes needed.
- Text docs currently have `pages: null`. Setting it to `{ pages: [{ strokes: [...], textBoxes: [], ... }] }` is fully compatible.
- Realtime sync already propagates `pages` changes via Supabase Realtime.
- **Important**: Setting `pages` to a truthy value will cause `isTextDocument` to become `false`. The routing logic needs adjustment to avoid switching to CanvasEditor when a text doc gains strokes.

**Alternatives considered**:

- **New `annotations` column**: Rejected — requires a migration, server action changes, and realtime sync updates for no meaningful benefit.
- **Store in `content` alongside TipTap JSON**: Rejected — pollutes the TipTap data model, harder to extract and render.

## Decision 3: Routing Logic Change

**Decision**: Change `isTextDocument` to check for the presence of TipTap `content` and absence of `material_id`, rather than relying on `!pages`. This allows text documents to have drawing strokes in `pages` while still routing to the TipTap-based editor.

**Rationale**:

- Currently: `isTextDocument = !typedDocument.pages && !typedDocument.material_id`
- Once a text doc has strokes, `pages` becomes truthy and the doc would incorrectly route to CanvasEditor.
- A better heuristic: a text document is one that was created as a text-only doc (imported .docx) or has no canvas page structure with text boxes. We can add a `documentMode` flag or check a marker in the `pages` object.
- Simplest approach: add a `mode: 'text' | 'canvas'` field to the pages object, or a top-level `document_mode` marker. Alternatively, check if `pages.pages[0].flowContent` exists (canvas docs use flowContent, text overlay docs don't).

**Alternatives considered**:

- **Add a `document_mode` column to the database**: Cleaner long-term but requires a migration. Consider if scope permits.
- **Check page count / content type heuristic**: Fragile; breaks if canvas docs happen to have similar structure.

## Decision 4: Drawing Infrastructure Reuse

**Decision**: Reuse `use-drawing.ts` and `use-eraser.ts` hooks directly in a new drawing overlay component for the TipTap editor.

**Rationale**:

- Both hooks accept configuration (activeTool, colors, sizes, callbacks) and return pointer event handlers — they're already decoupled from CanvasEditor.
- `use-drawing.ts` uses `perfect-freehand` for stroke rendering, which works on any canvas element.
- `use-eraser.ts` uses `isStrokeHit()` from stroke-utils for hit detection.
- Scroll lock (`scroll-lock.ts`) is also reusable.

**Alternatives considered**:

- **Create new simplified drawing hooks**: Rejected — would duplicate logic and diverge over time.
- **Extract a shared DrawingCanvas component from CanvasPage**: Possible future refactor, but not required now. The hooks + a new overlay component are sufficient.

## Decision 5: Toolbar Integration

**Decision**: Add a draw mode toggle button to `EditorToolbar` and conditionally show draw sub-tools (pen/highlighter/eraser with settings) when draw mode is active.

**Rationale**:

- The EditorToolbar already uses a `ToolbarButton` pattern with tooltips and active states.
- Adding a draw toggle follows the same pattern.
- Sub-tools (pen, highlighter, eraser, color/size pickers) can be rendered conditionally, similar to how CanvasEditor shows sub-tools when `isDrawMode` is true.
- Color/size constants already exist in canvas-editor.tsx (lines 101-139) and can be extracted to shared constants.

## Decision 6: Undo/Redo

**Decision**: Implement a separate undo/redo stack for drawing actions in text documents, independent of TipTap's built-in undo/redo for text.

**Rationale**:

- TipTap has its own undo/redo via ProseMirror history extension.
- Canvas strokes use a separate stack-based undo/redo (CanvasAction[] stacks).
- Mixing them into a single stack would create complex interleaving issues.
- In draw mode, Ctrl+Z undoes the last stroke; in text mode, Ctrl+Z undoes the last text edit. This matches CanvasEditor behavior.

## Key Files Identified

### Must Modify

- `src/components/editor/tiptap-editor.tsx` — Add drawing state, canvas overlay, mode switching
- `src/components/editor/editor-toolbar.tsx` — Add draw mode toggle and sub-tools
- `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — Fix `isTextDocument` routing

### Reuse As-Is

- `src/hooks/use-drawing.ts` — Pointer event handlers for drawing
- `src/hooks/use-eraser.ts` — Pointer event handlers for erasing
- `src/lib/canvas/stroke-utils.ts` — Stroke rendering and hit detection
- `src/lib/canvas/coordinate-utils.ts` — High-DPI canvas setup
- `src/lib/canvas/scroll-lock.ts` — Scroll prevention during drawing
- `src/types/canvas.ts` — Stroke, CanvasPage, CanvasTool types

### May Need New

- `src/components/editor/drawing-overlay.tsx` — Canvas overlay component for TipTap editor (draws on top of text content)
