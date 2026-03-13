# Quickstart: Export as PDF

**Feature**: 005-export-pdf

## Prerequisites

- Node.js 18+
- pnpm installed
- Local dev server running (`pnpm dev`)

## Setup

```bash
# Install new dependencies
pnpm add jspdf svg2pdf.js

# Download Geist font TTF files for PDF embedding
# Place in public/fonts/
# - GeistSans-Regular.ttf
# - GeistSans-Bold.ttf
# - GeistSans-Italic.ttf
# - GeistMono-Regular.ttf

# Run tests
pnpm test

# Run e2e tests
pnpm exec playwright test
```

## Key Files

| File                                    | Purpose                                      |
| --------------------------------------- | -------------------------------------------- |
| `src/lib/pdf/export-pdf.ts`             | Main entry — `exportDocumentAsPdf(document)` |
| `src/lib/pdf/canvas-page-renderer.ts`   | Canvas pages → PDF pages                     |
| `src/lib/pdf/text-document-renderer.ts` | TipTap text → paginated A4 PDF pages         |
| `src/lib/pdf/stroke-renderer.ts`        | perfect-freehand strokes → PDF vector paths  |
| `src/lib/pdf/background-renderer.ts`    | Page backgrounds (lined/grid/dotted/blank)   |
| `src/lib/pdf/math-renderer.ts`          | KaTeX math → PDF via svg2pdf.js              |
| `src/lib/pdf/font-loader.ts`            | Geist font registration with jsPDF           |
| `src/hooks/use-export-pdf.ts`           | React hook for UI integration                |

## Quick Test

1. Open a document with canvas pages and strokes
2. Click "Export as PDF" in the toolbar
3. Verify the downloaded PDF has:
   - Vector strokes (zoom to 400% — should be crisp)
   - Selectable text in text boxes
   - Correct page background pattern
