# Implementation Plan: PDF Export Overhaul

**Branch**: `020-pdf-export-overhaul` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-pdf-export-overhaul/spec.md`

## Summary

Replace the manual jsPDF-based PDF export with browser-native `window.print()` on a styled HTML document. The current approach manually reconstructs every element (~1,085 lines of layout code) but can't support Hebrew BiDi or LaTeX math. The new approach generates an HTML document from TipTap JSON (using the same CSS the editor uses), renders KaTeX math client-side, includes Hebrew fonts, and lets the browser's print engine produce the PDF. Canvas strokes are converted to SVG paths for vector output. This gives EXACT WYSIWYG fidelity — same browser renders both the editor and the PDF — with real selectable text, all client-side, no server dependencies.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16, TipTap 3 (generateHTML), KaTeX (renderToString), perfect-freehand — all already installed
**New Dependencies**: None (only Noto Sans Hebrew font files added to `/public/fonts/`)
**Storage**: No changes — reads existing `documents` table from Supabase
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web (client-side only)
**Project Type**: Web application
**Performance Goals**: Print dialog opens within 2 seconds of clicking export
**Constraints**: Requires a modern browser with print-to-PDF support (all major browsers)

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Incremental Development | ✅ PASS | Phased: text first, then canvas, then mixed. Each phase produces a working increment. |
| II. Test-Driven Quality | ✅ PASS | Unit tests for HTML template + SVG conversion. E2E tests for export flow. |
| III. Protected Main Branch | ✅ PASS | Working on feature branch `020-pdf-export-overhaul`. |
| IV. Migrations as Code | ✅ PASS (N/A) | No database changes. |
| V. Interview-Ready Architecture | ✅ PASS | Browser print architecture, CSS print layout, SVG graphics pipeline — all strong interview topics. |

## Project Structure

### Documentation

```text
specs/020-pdf-export-overhaul/
├── spec.md
├── plan.md              # This file
├── research.md          # Approach evaluation + decisions
├── data-model.md        # Existing entities + intermediate structures
├── quickstart.md        # Dev setup + key files
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code

```text
src/
├── lib/
│   └── pdf/
│       ├── print-export.ts        # NEW: orchestrates HTML generation + window.print()
│       ├── html-template.ts       # NEW: builds styled HTML from TipTap JSON
│       ├── stroke-to-svg.ts       # NEW: perfect-freehand points → SVG <path>
│       ├── page-background-svg.ts # NEW: SVG backgrounds (lined/grid/dotted)
│       ├── utils.ts               # KEEP: filename sanitization
│       ├── export-pdf.ts          # REMOVE after migration
│       ├── tiptap-to-pdf.ts       # REMOVE after migration
│       ├── text-document-renderer.ts  # REMOVE after migration
│       ├── font-loader.ts         # REMOVE after migration
│       ├── math-renderer.ts       # REMOVE after migration
│       ├── canvas-page-renderer.ts    # REMOVE after migration
│       ├── stroke-renderer.ts     # REMOVE after migration
│       └── background-renderer.ts # REMOVE after migration
├── hooks/
│   └── use-export-pdf.ts         # MODIFIED: call print-export instead of jsPDF
└── components/
    └── editor/
        └── editor-toolbar.tsx     # UNCHANGED (uses same hook)

public/
└── fonts/
    ├── GeistSans-Regular.ttf      # EXISTING
    ├── GeistSans-Bold.ttf         # EXISTING
    ├── GeistSans-Italic.ttf       # EXISTING
    ├── GeistMono-Regular.ttf      # EXISTING
    ├── NotoSansHebrew-Regular.ttf # NEW
    └── NotoSansHebrew-Bold.ttf    # NEW
```

## Architecture

### High-Level Flow

```
User clicks "Export as PDF"
       │
       ▼
useExportPdf() hook
       │
       ▼
printExportDocument(document)          ← src/lib/pdf/print-export.ts
       │
       ├── Classify: text-only / canvas-only / mixed
       │
       ├── Build HTML string:
       │   ├── <head>: @font-face (Geist + Noto Sans Hebrew)
       │   ├── <head>: KaTeX CSS
       │   ├── <head>: Editor prose CSS (Tailwind typography)
       │   ├── <head>: @page + @media print rules
       │   │
       │   ├── Text content:
       │   │   ├── TipTap generateHTML() → HTML
       │   │   └── Math nodes → KaTeX renderToString() → rendered HTML
       │   │
       │   └── Canvas pages:
       │       ├── Strokes → SVG <path> (via stroke-to-svg.ts)
       │       ├── Text boxes → positioned <div>s
       │       └── Backgrounds → SVG patterns (via page-background-svg.ts)
       │
       ├── Open new browser window
       ├── Write HTML to window
       ├── Wait for fonts to load (document.fonts.ready)
       ├── window.print()                ← Browser renders PDF natively
       └── Close window after print
```

### Key Design Decisions

**1. Why window.print() instead of jsPDF or Puppeteer?**

The browser already renders TipTap content, KaTeX math, and Hebrew text perfectly. Instead of reimplementing the browser's layout engine in JavaScript (jsPDF, ~1,085 lines) or running a second browser on a server (Puppeteer), we use the same browser that's already open. The output is EXACT because it IS the same rendering engine.

**Interview angle**: "Build vs. use the platform" — we stopped fighting the browser and started using it. The browser's print engine is a production-grade PDF renderer that handles Unicode BiDi, font shaping, CSS layout, and SVG rendering. Reimplementing any of that is wasted effort.

**2. Why generateHTML() + renderToString() instead of cloning the editor DOM?**

The export can be triggered from the dashboard (document card context menu) where the editor isn't open. Generating HTML from JSON works from both entry points. It also gives us control over print-specific CSS without affecting the editor.

**3. Why SVG for canvas strokes?**

The Canvas 2D API renders to a bitmap — it would print as a low-resolution image. SVG paths are vector — the browser prints them as high-resolution vector paths in the PDF. `perfect-freehand` already provides the polygon points; converting to SVG `<path>` is trivial.

**4. The print dialog trade-off**

The user clicks one button in the print dialog ("Save as PDF"). This is the same UX as Google Docs, Notion, Overleaf, and most professional web apps. In exchange, we get: exact rendering, real text, zero server costs, zero deployment complexity.

## Implementation Phases

### Phase 1: Text Document Export (P1 — LaTeX + Hebrew + Rich Text)

**Goal**: Text-only documents export with correct LaTeX math, Hebrew BiDi, and full rich text fidelity via browser print.

**Scope**:
- `html-template.ts` — generates HTML from TipTap JSON with editor CSS, KaTeX rendering, Hebrew font, print CSS
- `print-export.ts` — opens print window, writes HTML, triggers print
- `use-export-pdf.ts` — updated to call new export function
- Hebrew font added to `/public/fonts/`
- Unit tests + E2E tests

**Deliverable**: A user can export a text document with LaTeX, Hebrew, and rich formatting. The PDF matches the editor exactly.

### Phase 2: Canvas Page Export (P2 — Strokes + Backgrounds)

**Goal**: Canvas pages with strokes, text boxes, and backgrounds export via browser print.

**Scope**:
- `stroke-to-svg.ts` — convert strokes to SVG paths
- `page-background-svg.ts` — SVG backgrounds
- Canvas page HTML template in `html-template.ts`
- Unit tests + E2E tests

**Deliverable**: Canvas documents with strokes export as vector PDFs.

### Phase 3: Mixed Documents + Cleanup

**Goal**: Mixed documents work. Old jsPDF code removed.

**Scope**:
- Handle mixed documents (canvas + text pages in one print)
- Remove old modules (~8 files)
- Update existing tests
- Remove jsPDF dependency if no longer needed elsewhere

**Deliverable**: All document types export. Old code removed. Test suite passes.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Print dialog UX friction | Low | Users unfamiliar with print-to-PDF | Add tooltip/guidance on first use |
| CSS pagination edge cases | Low | Headings may orphan in rare cases | CSS `break-after: avoid`; test with long documents |
| Font loading in print window | Low | Hebrew font may not load before print | Wait for `document.fonts.ready` before calling print() |
| Browser differences in print output | Medium | Slightly different margins/spacing across browsers | Test in Chrome, Firefox, Safari; document any differences |
