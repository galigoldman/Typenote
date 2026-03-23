# Quickstart: PDF Export Overhaul

**Branch**: `020-pdf-export-overhaul` | **Date**: 2026-03-23

## Prerequisites

- Node.js 22+
- pnpm
- A modern browser (Chrome, Firefox, Safari)

## New Dependencies

**None.** All libraries are already installed (TipTap, KaTeX, perfect-freehand). Only font files are added.

## Setup

1. **Hebrew fonts**: Download Noto Sans Hebrew TTF files and place in `public/fonts/`:
   - `NotoSansHebrew-Regular.ttf`
   - `NotoSansHebrew-Bold.ttf`

2. **Start dev server**:
   ```bash
   pnpm dev
   ```

3. **Test PDF export**:
   - Create a document with LaTeX math and/or Hebrew text
   - Click "Export as PDF" in the editor toolbar
   - In the print dialog, select "Save as PDF" and save
   - Verify math renders as notation and Hebrew text direction is correct

## Key Files

### New Files
| File | Purpose |
|------|---------|
| `src/lib/pdf/print-export.ts` | Orchestrates HTML generation + opens print window |
| `src/lib/pdf/html-template.ts` | Builds styled HTML from TipTap JSON (editor CSS + KaTeX + fonts + print rules) |
| `src/lib/pdf/stroke-to-svg.ts` | Converts perfect-freehand strokes to SVG path elements |
| `src/lib/pdf/page-background-svg.ts` | Generates SVG backgrounds (lined, grid, dotted) |

### Modified Files
| File | Change |
|------|--------|
| `src/hooks/use-export-pdf.ts` | Calls `printExportDocument()` instead of `exportDocumentAsPdf()` |

### Files to Remove (after migration)
| File | Reason |
|------|--------|
| `src/lib/pdf/export-pdf.ts` | Replaced by print-export.ts |
| `src/lib/pdf/tiptap-to-pdf.ts` | Replaced by html-template.ts + browser rendering |
| `src/lib/pdf/text-document-renderer.ts` | Replaced by CSS pagination |
| `src/lib/pdf/font-loader.ts` | Replaced by @font-face in HTML template |
| `src/lib/pdf/math-renderer.ts` | KaTeX renders natively in the browser |
| `src/lib/pdf/canvas-page-renderer.ts` | Replaced by SVG in HTML |
| `src/lib/pdf/stroke-renderer.ts` | Replaced by stroke-to-svg.ts |
| `src/lib/pdf/background-renderer.ts` | Replaced by page-background-svg.ts |

## Running Tests

```bash
pnpm test                    # Unit tests
pnpm exec playwright test    # E2E tests
```

## Architecture Notes

**Why window.print()?** The browser already renders TipTap, KaTeX, and Hebrew text perfectly. Instead of reimplementing the browser's layout engine (~1,085 lines of jsPDF code), we generate styled HTML and let the browser's print engine produce the PDF. The output is EXACT because it's the same rendering engine.

**How it works**: TipTap JSON → generateHTML() → styled HTML with editor CSS + KaTeX + @font-face → open in print window → window.print() → browser produces PDF with real selectable text.

**Canvas strokes**: perfect-freehand polygon points → SVG `<path>` elements. The browser prints SVG as vector paths (not rasterized).
