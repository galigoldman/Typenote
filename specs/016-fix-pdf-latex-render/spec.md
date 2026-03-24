# Feature Specification: Fix PDF LaTeX Rendering

**Feature Branch**: `016-fix-pdf-latex-render`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Fix PDF export to render LaTeX as formatted math instead of raw code, matching academic PDF standards with selectable text"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Inline Math Renders as Formatted Math in PDF (Priority: P1)

A student writes notes containing inline math expressions (e.g., `$\frac{1}{2} \times 5$`) using the editor's dollar-sign math input. When they export the document as PDF, the math appears as properly rendered mathematical notation — fractions display vertically, multiplication signs render as `×`, Greek letters display correctly — exactly as it appears while editing.

**Why this priority**: This is the core bug. Currently, all math exports as raw LaTeX code (e.g., `\frac{1}{2} \times 5`), making exported PDFs unusable for academic submission or study.

**Independent Test**: Export a document containing inline math expressions and verify that the PDF shows rendered math notation identical to the editor preview.

**Acceptance Scenarios**:

1. **Given** a document with inline math `$\frac{1}{2} \times 5$`, **When** the user exports to PDF, **Then** the PDF shows a rendered fraction (½) with a multiplication sign (×) and the number 5 — not the raw LaTeX string.
2. **Given** a document with multiple inline math expressions in the same paragraph, **When** exported to PDF, **Then** each expression renders correctly inline with surrounding text, maintaining proper baseline alignment.
3. **Given** a document with complex expressions (nested fractions, summations, integrals, matrices), **When** exported to PDF, **Then** all expressions render with correct mathematical typesetting.

---

### User Story 2 - Math Text Is Selectable in PDF (Priority: P2)

When viewing the exported PDF in any standard PDF reader (Chrome, Adobe Acrobat, Preview), the rendered math content is selectable and copyable as text, matching the behavior of academic PDF documents produced by LaTeX compilers.

**Why this priority**: Academic PDFs require selectable text for accessibility, copy-paste workflows, and institutional submission requirements. Rasterized (image-based) math fails these requirements.

**Independent Test**: Open an exported PDF, attempt to select and copy a math expression, and verify the selection highlights and copies text content.

**Acceptance Scenarios**:

1. **Given** an exported PDF containing math expressions, **When** the user clicks and drags over a math expression in a PDF reader, **Then** the math content highlights and can be copied.
2. **Given** an exported PDF, **When** the user uses "Select All" (Ctrl+A / Cmd+A), **Then** math expressions are included in the selection alongside regular text.

---

### User Story 3 - Graceful Fallback for Rendering Failures (Priority: P3)

If the math rendering pipeline encounters an error (e.g., invalid LaTeX syntax, browser environment limitations), the system falls back gracefully — first attempting rasterized rendering, then displaying the raw LaTeX string — rather than crashing the entire PDF export.

**Why this priority**: Export reliability must not regress. Even a partial rendering is better than a failed export.

**Independent Test**: Export a document with intentionally malformed LaTeX (e.g., `$\frac{1}{$`) and verify the PDF exports successfully with a visible fallback representation.

**Acceptance Scenarios**:

1. **Given** a document with valid and invalid math expressions, **When** exported to PDF, **Then** valid expressions render as math and invalid expressions display as readable fallback text — the export completes without error.
2. **Given** a browser environment where vector math embedding fails, **When** the user exports to PDF, **Then** the system falls back to image-based rendering and the export still completes.

---

### Edge Cases

- What happens when a math expression is extremely long (e.g., a multi-term equation spanning the full page width)? It should wrap or scale to fit within page margins.
- How does rendering behave when math appears inside headings, bullet lists, blockquotes, or code blocks? Each container type should support math rendering.
- What happens when a document contains dozens of math expressions? Export should complete within a reasonable time without memory issues.
- How does math render in text boxes on canvas pages versus flow content? Both contexts should render identically.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST render `mathExpression` nodes as visually formatted mathematical notation in exported PDFs, not as raw LaTeX source code.
- **FR-002**: System MUST produce math content as vector-based (selectable) text in the PDF, matching the standard set by academic PDF documents.
- **FR-003**: System MUST maintain proper baseline alignment between inline math and surrounding text within a paragraph.
- **FR-004**: System MUST support all LaTeX expressions that the editor's math renderer supports, including fractions, Greek letters, operators, summations, integrals, and matrices.
- **FR-005**: System MUST provide a multi-tier fallback strategy: vector rendering → image-based rendering → plain text, ensuring PDF export never fails due to math rendering.
- **FR-006**: System MUST render math correctly in all content contexts: paragraphs, headings, bullet/numbered/task lists, blockquotes, and text boxes on canvas pages.
- **FR-007**: System MUST handle page breaks correctly when math expressions appear near page boundaries — expressions should not be clipped or split across pages.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of valid LaTeX expressions that render correctly in the editor also render as formatted math in the exported PDF.
- **SC-002**: Math content in exported PDFs is selectable and copyable in standard PDF readers (Chrome built-in viewer, Adobe Acrobat, Apple Preview).
- **SC-003**: PDF export with math expressions completes without errors or crashes across all supported expression types.
- **SC-004**: Export time for a document with up to 50 inline math expressions remains under 10 seconds.
- **SC-005**: Visual appearance of math in the PDF closely matches the editor preview (same symbols, layout, and proportions).

## Assumptions

- The existing math-renderer module with vector-based math rendering pipeline provides the foundation for this fix.
- Math rendering CSS and font resources are available in the browser environment at export time.
- The vector embedding library (already a project dependency) supports the SVG embedding needed for selectable text rendering.
- Users primarily view exported PDFs in modern PDF readers that support standard PDF text selection.
