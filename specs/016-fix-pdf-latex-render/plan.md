# Implementation Plan: Fix PDF LaTeX Rendering

**Branch**: `016-fix-pdf-latex-render` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-fix-pdf-latex-render/spec.md`

## Summary

PDF export currently renders `mathExpression` nodes as raw LaTeX strings in monospace font instead of formatted math notation. The codebase already contains a complete math rendering module (`src/lib/pdf/math-renderer.ts`) with a KaTeX → SVG → vector PDF pipeline (plus rasterization and text fallbacks), but it is never called from the TipTap-to-PDF converter (`src/lib/pdf/tiptap-to-pdf.ts`). The fix is to integrate the existing `renderMath` function into the inline content rendering pipeline, which requires making the rendering chain async since `renderMath` uses the async `doc.svg()` from svg2pdf.js.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: jsPDF, svg2pdf.js, KaTeX, React 19, Next.js 16
**Storage**: N/A — client-side PDF rendering only, no database changes
**Testing**: Vitest (unit tests with mocked jsPDF)
**Target Platform**: Browser (client-side PDF export)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Export 50 inline math expressions in under 10 seconds
**Constraints**: Must produce selectable (vector) text, not rasterized images; graceful fallback chain
**Scale/Scope**: Single bug fix — 4 files modified, 0 new files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                     |
| ------------------------------- | ------ | --------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix on existing feature; no new infrastructure needed |
| II. Test-Driven Quality         | PASS   | Will update existing tests + add math-specific tests      |
| III. Protected Main Branch      | PASS   | Working on feature branch `016-fix-pdf-latex-render`      |
| IV. Migrations as Code          | N/A    | No database changes                                       |
| V. Interview-Ready Architecture | PASS   | Will document the async cascade and rendering pipeline    |

No violations. Gate passed.

## Project Structure

### Documentation (this feature)

```text
specs/016-fix-pdf-latex-render/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/lib/pdf/
├── tiptap-to-pdf.ts          # PRIMARY — integrate renderMath, make pipeline async
├── math-renderer.ts           # MODIFY — return rendered dimensions from renderMath
├── canvas-page-renderer.ts    # UPDATE — make renderCanvasPage async
├── text-document-renderer.ts  # UPDATE — make renderTextDocument async
├── export-pdf.ts              # UPDATE — await async renderers
└── __tests__/
    └── tiptap-to-pdf.test.ts  # UPDATE — async tests + math rendering tests
```

**Structure Decision**: All changes are within the existing `src/lib/pdf/` module. No new files or directories needed.

## Complexity Tracking

No constitution violations — this section is not applicable.

## Post-Design Constitution Re-Check

| Principle                       | Status | Notes                                                                                              |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | No new infrastructure — wiring existing module into existing pipeline                              |
| II. Test-Driven Quality         | PASS   | Existing tests updated to async; new math rendering tests added                                    |
| III. Protected Main Branch      | PASS   | All work on `016-fix-pdf-latex-render` branch                                                      |
| IV. Migrations as Code          | N/A    | No database changes                                                                                |
| V. Interview-Ready Architecture | PASS   | Async cascade pattern, rendering pipeline, and fallback strategy are all interview-relevant topics |

Gate passed. Ready for task generation.
