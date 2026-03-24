# Implementation Plan: Fix LaTeX Math Direction in RTL Text

**Branch**: `027-fix-latex-rtl` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/027-fix-latex-rtl/spec.md`

## Summary

LaTeX math expressions rendered via KaTeX inherit RTL text direction from surrounding Hebrew text, causing mathematical symbols to mirror (e.g., `∈` becomes `∋`). The fix adds explicit `direction: ltr` and `unicode-bidi: isolate` CSS to all `.katex` containers across three rendering surfaces: the live editor, server-side PDF HTML, and the math measurement renderer.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), TipTap 3, KaTeX 0.16.x, perfect-freehand
**Storage**: N/A — no data changes, CSS-only fix
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A — CSS property addition, no performance impact
**Constraints**: Must not break existing LTR math rendering; must not affect RTL text outside math
**Scale/Scope**: 3 files modified, ~6 lines of CSS added

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                          |
| ------------------------------- | ------ | -------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix on existing feature, no new infrastructure             |
| II. Test-Driven Quality         | PASS   | Will add test verifying KaTeX LTR direction                    |
| III. Protected Main Branch      | PASS   | Working on feature branch `027-fix-latex-rtl`                  |
| IV. Migrations as Code          | N/A    | No database changes                                            |
| V. Interview-Ready Architecture | PASS   | Unicode BiDi algorithm is a relevant topic for i18n interviews |

**Post-Phase 1 Re-check**: All gates pass. No data model, no new dependencies, no architectural changes.

## Project Structure

### Documentation (this feature)

```text
specs/027-fix-latex-rtl/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no changes needed)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
src/
├── app/
│   └── globals.css                          # Add .katex LTR rule (editor rendering)
├── lib/
│   └── pdf/
│       ├── html-template.ts                 # Add .katex LTR rule to PROSE_CSS (PDF export)
│       └── math-renderer.ts                 # Add LTR style to measurement container
└── components/
    └── editor/
        └── math-node-view.tsx               # Reference only — no changes needed (inherits from globals.css)

__tests__/                                   # New test for KaTeX direction
```

**Structure Decision**: No new files or directories needed beyond the test file. This is a targeted CSS fix across existing rendering surfaces.

## Implementation Approach

### Why This Approach

**The Unicode Bidirectional Algorithm (UBidi)** is a W3C/Unicode standard that determines text direction at render time. When a paragraph contains Hebrew characters, the browser assigns `direction: rtl` to the text run. Child elements like KaTeX `<span>` nodes inherit this direction, causing:

1. **Character mirroring**: Unicode defines "mirrored" pairs (∈/∋, </>, (/)) that swap in RTL context
2. **Layout reversal**: Flexbox and inline elements flow right-to-left

The fix uses two CSS properties:

- `direction: ltr` — forces LTR layout for math content
- `unicode-bidi: isolate` — creates a bidi isolation boundary, preventing the math from affecting (or being affected by) surrounding text direction. This is the modern W3C recommendation over `embed` or `bidi-override`.

**Interview relevance**: The Unicode BiDi algorithm, CSS `direction`/`unicode-bidi` properties, and i18n text handling are common topics in frontend/full-stack interviews, especially for companies with international users.

### Changes by File

#### 1. `src/app/globals.css`

Add a CSS rule targeting `.katex` elements to enforce LTR direction in the live editor:

```css
/* Ensure math expressions always render LTR, even in RTL text contexts */
.katex {
  direction: ltr;
  unicode-bidi: isolate;
}
```

This single rule covers all inline and display KaTeX renderings in the editor because `math-node-view.tsx` uses `katex.renderToString()` which outputs `<span class="katex">`.

#### 2. `src/lib/pdf/html-template.ts`

Add the same rule to the `PROSE_CSS` constant, which defines styles for the server-side HTML document used in Puppeteer-based PDF export:

```css
.katex {
  direction: ltr;
  unicode-bidi: isolate;
}
```

Place it near the existing `.katex-display` rule (line ~218).

#### 3. `src/lib/pdf/math-renderer.ts`

Add `direction: 'ltr'` to the hidden DOM container used for measuring KaTeX output dimensions. This ensures measurements are accurate for LTR math even when the page context is RTL.

### What NOT to Change

- **`math-node-view.tsx`**: No changes needed — it renders KaTeX into the DOM, which will pick up the global CSS rule from `globals.css`.
- **`math-extension.ts`**: No changes — this is the TipTap node schema/plugin, not rendering.
- **`<body dir="auto">`**: Keep as-is in `html-template.ts` — this correctly enables RTL for Hebrew text. The `.katex` override handles math specifically.
- **Database/migrations**: No changes needed.
