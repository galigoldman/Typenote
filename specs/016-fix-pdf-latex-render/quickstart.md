# Quickstart: Fix PDF LaTeX Rendering

## What This Fix Does

Wires the existing `math-renderer.ts` module into the PDF export pipeline so LaTeX math expressions render as formatted notation (like academic PDFs) instead of raw code strings.

## Key Files

| File                                          | Role                         | Change Type                                 |
| --------------------------------------------- | ---------------------------- | ------------------------------------------- |
| `src/lib/pdf/tiptap-to-pdf.ts`                | TipTap JSON → PDF converter  | Primary: integrate `renderMath`, make async |
| `src/lib/pdf/math-renderer.ts`                | KaTeX → SVG → PDF renderer   | Modify: return rendered dimensions          |
| `src/lib/pdf/canvas-page-renderer.ts`         | Canvas page orchestrator     | Update: make async                          |
| `src/lib/pdf/text-document-renderer.ts`       | Text document paginator      | Update: make async                          |
| `src/lib/pdf/export-pdf.ts`                   | Top-level export entry point | Update: await async renderers               |
| `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts` | Unit tests                   | Update: async + math tests                  |

## Implementation Order

1. **math-renderer.ts** — Change `renderMath` return type to `Promise<{ width: number; height: number }>`
2. **tiptap-to-pdf.ts** — Replace plain-text math fallback with `await renderMath()` call; make all functions in the chain async
3. **canvas-page-renderer.ts** — Make `renderCanvasPage` async, await `renderTiptapContent`
4. **text-document-renderer.ts** — Make `renderTextDocument` async, await `renderTiptapContent`
5. **export-pdf.ts** — Add `await` to `renderCanvasPage` and `renderTextDocument` calls
6. **Tests** — Update all sync calls to async, add math rendering tests

## How to Test Manually

1. `pnpm dev` — start the app
2. Create a document with math: type `$` then enter `\frac{1}{2} \times 5`
3. Verify math renders correctly in the editor
4. Export to PDF (File → Export PDF)
5. Open the PDF — math should show as ½ × 5, not `\frac{1}{2} \times 5`
6. Try selecting the math text — it should be selectable

## Run Tests

```bash
pnpm test                    # Full test suite
pnpm test src/lib/pdf        # PDF module tests only
```
