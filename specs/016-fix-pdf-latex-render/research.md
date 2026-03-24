# Research: Fix PDF LaTeX Rendering

**Date**: 2026-03-23
**Feature**: 016-fix-pdf-latex-render

## Root Cause Analysis

### Decision: The math renderer exists but is never called

**Rationale**: `src/lib/pdf/math-renderer.ts` (275 lines) implements a full 3-tier rendering pipeline:

1. KaTeX → HTML → SVG `<foreignObject>` → vector PDF via `doc.svg()` (selectable text)
2. Fallback: KaTeX → HTML → Canvas rasterization → PNG in PDF (non-selectable)
3. Last resort: Raw LaTeX string as italic text

However, `src/lib/pdf/tiptap-to-pdf.ts` at lines 328-354 renders `mathExpression` nodes as plain monospace text with the comment: _"A dedicated math-renderer module can be integrated here once available."_

**Alternatives considered**: None — the module was clearly designed for this purpose but never wired in.

## Async Pipeline Migration

### Decision: Make the entire rendering chain async

**Rationale**: `renderMath()` is async because svg2pdf.js's `doc.svg()` returns a Promise. The current `renderInlineContent` → `renderNode` → `renderTiptapContent` chain is fully synchronous. Since math expressions can appear in any block type (paragraphs, headings, lists, blockquotes), every function in the chain must become async.

**Affected functions** (all in `tiptap-to-pdf.ts`):

- `renderInlineContent` → `async` (calls `renderMath`)
- `renderParagraph` → `async` (calls `renderInlineContent`)
- `renderHeading` → `async` (calls `renderInlineContent`)
- `renderListItem` → `async` (calls `renderInlineContent` + `renderNode`)
- `renderBulletList` → `async` (calls `renderListItem`)
- `renderOrderedList` → `async` (calls `renderListItem`)
- `renderTaskList` → `async` (calls `renderListItem`)
- `renderBlockquote` → `async` (calls `renderNode`)
- `renderNode` → `async` (dispatches to all above)
- `renderTiptapContent` → `async` (public API — calls `renderNode`)

**In other files:**

- `renderCanvasPage` → `async` (calls `renderTiptapContent`)
- `renderTextDocument` → `async` (calls `renderTiptapContent`)
- `exportDocumentAsPdf` — already async, just needs `await` added

**Alternatives considered**:

- _Pre-process math expressions_ (collect all math, render async in batch, cache results, use synchronously): Rejected because `renderMath` renders directly at specific x,y coordinates that are only known at cursor-time during inline layout.
- _Use synchronous rendering only_: Rejected because svg2pdf.js's vector embedding is inherently async, and vector rendering is required for selectable text (FR-002).

## Return Dimensions from renderMath

### Decision: Modify `renderMath` to return `{ width: number, height: number }`

**Rationale**: The inline renderer needs to know how much horizontal space the math expression consumed to advance the cursor (`cursorX += width`). Currently `renderMath` returns `Promise<void>`. The rendered dimensions are already computed internally (from `container.getBoundingClientRect()`), so this is a matter of returning them.

**Change**: `renderMath` signature becomes:

```typescript
export async function renderMath(
  doc: jsPDF,
  latex: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Promise<{ width: number; height: number }>;
```

The text fallback (`renderMathAsText`) also needs to return dimensions, measured via `doc.getTextDimensions()`.

**Alternatives considered**:

- _Separate `measureMath` function_: More complex, duplicates DOM measurement logic. Rejected.

## Test Strategy

### Decision: Update existing tests to async + add math-specific tests

**Rationale**:

- All existing `renderTiptapContent` test calls are synchronous — they must become `await renderTiptapContent(...)` since the function signature changes.
- New tests needed: (1) math expressions call `renderMath` instead of plain text, (2) fallback behavior when `renderMath` fails, (3) math in various container types.
- `math-renderer.ts` tests require DOM mocking (jsdom), which is already the Vitest environment.

**Alternatives considered**: E2E PDF visual regression testing — deferred to future; unit tests with mocked jsPDF are sufficient for this integration fix.
