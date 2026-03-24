# Research: Fix LaTeX Math Direction in RTL Text

**Date**: 2026-03-24
**Feature**: 027-fix-latex-rtl

## Research Tasks

### 1. Root Cause: Why KaTeX Renders RTL in Hebrew Context

**Decision**: The bug is caused by CSS `direction` inheritance. KaTeX elements lack an explicit `direction: ltr` override, so they inherit RTL from the surrounding text context.

**Rationale**:
- In `html-template.ts`, the HTML document uses `<body dir="auto">`. When Hebrew text is present, the browser's Unicode Bidirectional Algorithm (UBidi) determines the paragraph direction as RTL.
- KaTeX's own CSS (`katex.min.css`) does **not** set `direction` on `.katex` elements.
- The browser mirrors certain Unicode characters (∈ ↔ ∋, < ↔ >, etc.) when `direction: rtl` is inherited, which changes mathematical meaning.
- In the editor (`math-node-view.tsx`), the same inheritance occurs — the TipTap editor's text container inherits direction from the content.

**Alternatives considered**:
- Setting `dir="ltr"` on `<body>` — rejected because it would break RTL text rendering for Hebrew.
- Using KaTeX's `output: "mathml"` option — rejected because MathML has its own bidi issues and KaTeX's MathML output is less mature.

### 2. Correct Fix Approach: CSS `direction` + `unicode-bidi`

**Decision**: Add `direction: ltr` and `unicode-bidi: isolate` to all `.katex` container elements.

**Rationale**:
- `direction: ltr` forces the KaTeX content to render left-to-right.
- `unicode-bidi: isolate` creates a bidi isolation boundary so the math content doesn't interfere with surrounding RTL text flow, and vice versa. This is the modern CSS standard (preferred over `bidi-override` which forcefully overrides ALL characters).
- The codebase already uses `unicode-bidi: bidi-override` in `pdf-text-layer.tsx` for a similar purpose, but `isolate` is more appropriate for embedded math.

**Alternatives considered**:
- `unicode-bidi: bidi-override` — too aggressive, would override ALL character directions including any intended RTL characters within math.
- `unicode-bidi: embed` — older approach, doesn't create full isolation.
- Inline `dir="ltr"` attributes on each KaTeX container — works but less maintainable than a single CSS rule.

### 3. Rendering Surfaces That Need the Fix

**Decision**: Three rendering surfaces need the fix:

| Surface | File | Fix Location |
| ------- | ---- | ------------ |
| Editor (live editing) | `src/app/globals.css` | Global CSS rule for `.katex` |
| PDF export (server-side HTML) | `src/lib/pdf/html-template.ts` | `PROSE_CSS` constant |
| Math renderer (vector/image) | `src/lib/pdf/math-renderer.ts` | Hidden DOM container styles |

**Rationale**:
- The global CSS fix in `globals.css` covers the live editor because TipTap renders KaTeX into the DOM using `katex.renderToString()` in `math-node-view.tsx`.
- The PDF export generates a standalone HTML document with its own `<style>` block (`PROSE_CSS`), so it needs its own CSS rule.
- `math-renderer.ts` creates a hidden DOM container to measure KaTeX output — it should also have the LTR override for consistent measurement.

### 4. KaTeX CSS Classes Structure

**Decision**: Target `.katex` class selector, which is the root container KaTeX applies to all rendered math.

**Rationale**:
- `katex.renderToString()` wraps all output in `<span class="katex">...</span>`.
- Targeting `.katex` catches both inline and display math.
- `.katex-display` (display/block math) wraps a `.katex` element, so the rule on `.katex` covers both modes.
