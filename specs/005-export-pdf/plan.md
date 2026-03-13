# Implementation Plan: Export as PDF

**Branch**: `005-export-pdf` | **Date**: 2026-03-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-export-pdf/spec.md`

## Summary

Client-side PDF export for Typenote documents using jsPDF + svg2pdf.js. The export service converts document data (TipTap JSON content and/or canvas pages with strokes) into a downloadable PDF. Canvas pages produce fixed-layout PDF pages with vector strokes and positioned text. Text-only documents are paginated into A4 pages with font-embedded selectable text. Triggered from both the editor toolbar and dashboard context menu.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 18+
**Primary Dependencies**: jsPDF (PDF construction), svg2pdf.js (KaTeX SVG embedding), perfect-freehand (stroke outlines, already installed), KaTeX (math rendering, already installed)
**Storage**: No new storage — reads existing document data from Supabase `documents` table
**Testing**: Vitest (unit tests for renderers/paginator), Playwright (e2e for download flow)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Web application (Next.js 16 App Router)
**Performance Goals**: < 5 seconds for documents with 10 or fewer pages
**Constraints**: Client-side only (no server-side PDF generation), bundle size increase < 150KB gzipped
**Scale/Scope**: Single-user export, documents typically < 50 pages

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status     | Notes                                                                                                                                                                                     |
| ------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS       | Feature is built in phases: core engine → canvas rendering → text rendering → UI triggers. Each phase produces testable output. No database changes needed.                               |
| II. Test-Driven Quality         | PASS       | Unit tests for each renderer module, integration tests for full document export, e2e tests for download UX. Uses Vitest + Playwright per constitution.                                    |
| III. Protected Main Branch      | PASS       | Work on `005-export-pdf` branch. PR with CI checks before merge.                                                                                                                          |
| IV. Migrations as Code          | PASS (N/A) | No database schema changes required. Feature reads existing data only.                                                                                                                    |
| V. Interview-Ready Architecture | PASS       | Pure function architecture (data in → PDF blob out) demonstrates separation of concerns. Strategy pattern for different document types. Pagination algorithm is a common interview topic. |

## Project Structure

### Documentation (this feature)

```text
specs/005-export-pdf/
├── plan.md              # This file
├── research.md          # Phase 0 output — library selection, rendering strategies
├── data-model.md        # Phase 1 output — no new entities, documents existing schema
├── quickstart.md        # Phase 1 output — developer setup guide
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── pdf/
│       ├── export-pdf.ts              # Main entry point: exportDocumentAsPdf()
│       ├── canvas-page-renderer.ts    # Renders canvas pages (strokes, text boxes, backgrounds)
│       ├── text-document-renderer.ts  # Renders text-only content with pagination
│       ├── background-renderer.ts     # Renders page backgrounds (blank/lined/grid/dotted)
│       ├── stroke-renderer.ts         # Converts perfect-freehand strokes to PDF paths
│       ├── math-renderer.ts           # Renders KaTeX math to PDF via svg2pdf.js
│       ├── font-loader.ts             # Loads and registers Geist fonts with jsPDF
│       ├── tiptap-to-pdf.ts           # Maps TipTap JSON nodes to jsPDF text commands
│       └── utils.ts                   # Filename sanitization, download trigger
├── components/
│   ├── editor/
│   │   └── toolbar.tsx                # (modified) Add "Export as PDF" button
│   └── dashboard/
│       └── document-card.tsx          # (modified) Add "Export as PDF" to context menu
├── hooks/
│   └── use-export-pdf.ts             # React hook: loading state, error handling, toast
└── public/
    └── fonts/
        ├── GeistSans-Regular.ttf
        ├── GeistSans-Bold.ttf
        ├── GeistSans-Italic.ttf
        └── GeistMono-Regular.ttf

src/test/
└── lib/pdf/
    ├── export-pdf.test.ts
    ├── canvas-page-renderer.test.ts
    ├── text-document-renderer.test.ts
    ├── background-renderer.test.ts
    ├── stroke-renderer.test.ts
    ├── tiptap-to-pdf.test.ts
    └── utils.test.ts
```

**Structure Decision**: All PDF export logic lives in `src/lib/pdf/` as a self-contained module with no React dependencies (pure functions). The only React integration is the `useExportPdf` hook and the two UI trigger points (toolbar + context menu). This separation makes the core engine testable in isolation and reusable.

## Complexity Tracking

No constitution violations to justify. The feature:

- Adds no new database tables or migrations
- Uses the existing document data model as-is
- Introduces two new dependencies (jsPDF, svg2pdf.js) which are standard for this use case
- All new code is in a single self-contained module (`src/lib/pdf/`)
