# Feature Specification: PDF Export Overhaul

**Feature Branch**: `020-pdf-export-overhaul`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Searching the best way to export PDF from TipTap editor. It doesn't work with LaTeX, and can be weird with English/Hebrew mixup. Looks like we do something custom and not good. It shouldn't be manual."

## Background & Motivation

The current PDF export manually constructs every element (text wrapping, positioning, pagination) using low-level drawing commands. This approach has three critical problems:

1. **LaTeX math renders as raw text** — mathematical expressions like `x² + y² = z²` appear as the literal LaTeX source string `$x^2 + y^2 = z^2$` in monospace font, instead of properly formatted math notation.
2. **Hebrew/English bidirectional text is broken** — the underlying PDF library's RTL support is fundamentally broken for mixed-direction text (confirmed by its maintainers as unfixable within the library's architecture). Hebrew text with inline English words or numbers renders with reversed segments.
3. **Fragile and unmaintainable** — every TipTap node type must be manually re-implemented as drawing commands. Any new editor feature (tables, images, embeds) requires a parallel implementation in the PDF exporter. The current implementation is ~1,000 lines of manual layout code.

The goal is to replace this with an approach where the PDF output **matches what users see in the editor** — true WYSIWYG — without requiring custom rendering logic for each content type.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Export Document with LaTeX Math (Priority: P1)

A student writes lecture notes containing mathematical formulas using LaTeX (inline math like `$E = mc^2$` and display blocks). They export the document as PDF to print or share. The PDF must show the math as properly rendered notation — fractions, superscripts, integrals, summation symbols — exactly as it appears in the editor.

**Why this priority**: Math rendering is completely broken today (raw text output). This is the most user-visible defect and blocks the primary use case of exporting study materials.

**Independent Test**: Create a document with inline and display math expressions, export as PDF, verify all math renders as formatted notation (not source code).

**Acceptance Scenarios**:

1. **Given** a document with inline math `$\frac{a}{b}$`, **When** the user exports as PDF, **Then** the PDF shows a properly rendered fraction with numerator above denominator.
2. **Given** a document with a display math block containing `\sum_{i=1}^{n} x_i`, **When** the user exports as PDF, **Then** the PDF shows a summation symbol with limits rendered above and below.
3. **Given** a document mixing regular text and inline math in the same paragraph, **When** the user exports as PDF, **Then** the math appears inline with surrounding text at the correct vertical alignment.

---

### User Story 2 — Export Document with Hebrew and English Text (Priority: P1)

A student writes notes in Hebrew with occasional English terms, variable names, or citations mixed in. They export as PDF. The PDF must render Hebrew text right-to-left, English text left-to-right, and handle mixed paragraphs with correct bidirectional flow — matching what the editor displays.

**Why this priority**: Hebrew is a primary language for the user base. The current export produces garbled output for mixed-language content, making exported PDFs unusable for Hebrew-speaking users.

**Independent Test**: Create a document with Hebrew paragraphs containing inline English words and numbers, export as PDF, verify text direction and ordering match the editor.

**Acceptance Scenarios**:

1. **Given** a paragraph written entirely in Hebrew, **When** exported as PDF, **Then** the text flows right-to-left with correct character ordering.
2. **Given** a Hebrew paragraph containing the English phrase "Machine Learning" inline, **When** exported as PDF, **Then** the English text renders left-to-right within the right-to-left Hebrew flow, matching standard bidirectional text rules.
3. **Given** a Hebrew paragraph containing numbers like "42" or "2026", **When** exported as PDF, **Then** the numbers appear in the correct position and order within the RTL context.
4. **Given** a document with some paragraphs in Hebrew and others in English, **When** exported as PDF, **Then** each paragraph renders with the correct text direction based on its content.

---

### User Story 3 — WYSIWYG Fidelity for Rich Text (Priority: P2)

A student writes notes using headings, bold/italic text, bullet lists, numbered lists, code blocks, and blockquotes. They export as PDF. The output should closely match the visual appearance of the editor — same hierarchy, formatting, and structure.

**Why this priority**: Rich text is the baseline document content. While the current export handles basic text, replacing the rendering pipeline must preserve (and ideally improve) fidelity for all existing content types.

**Independent Test**: Create a document using every supported text formatting feature, export as PDF, compare visually to the editor.

**Acceptance Scenarios**:

1. **Given** a document with headings (H1, H2, H3), **When** exported as PDF, **Then** heading sizes and weights are visually distinct and match the editor hierarchy.
2. **Given** a document with nested bullet lists and numbered lists, **When** exported as PDF, **Then** list indentation and numbering/bullets are preserved.
3. **Given** a document with code blocks, **When** exported as PDF, **Then** code appears in a monospace font with a visually distinct background.
4. **Given** a document that spans multiple pages, **When** exported as PDF, **Then** content paginates cleanly without cutting headings from their following content.

---

### User Story 4 — Export Canvas Pages with Handwritten Strokes (Priority: P2)

A student has canvas pages with freehand pen strokes, handwritten notes, and text boxes. They export as PDF. The strokes must render as smooth vector paths (not pixelated images) at the correct positions, and text boxes must appear with their content in the right location.

**Why this priority**: Canvas pages with strokes are a core feature. The current stroke rendering works well — this story ensures the new export pipeline preserves that quality.

**Independent Test**: Create a canvas document with strokes on multiple pages and text boxes, export as PDF, verify strokes are smooth vectors and text boxes are positioned correctly.

**Acceptance Scenarios**:

1. **Given** a canvas page with freehand strokes, **When** exported as PDF, **Then** strokes render as smooth vector paths at the correct positions and sizes.
2. **Given** a canvas page with text boxes containing formatted text, **When** exported as PDF, **Then** text box content renders at the correct position with proper formatting.
3. **Given** a canvas page with a page background (lined, grid, dotted), **When** exported as PDF, **Then** the background pattern renders correctly behind the strokes.
4. **Given** a mixed document with both canvas pages and text pages, **When** exported as PDF, **Then** both page types render correctly in order.

---

### User Story 5 — Export with Combined LaTeX, Hebrew, and Rich Content (Priority: P3)

A student writes Hebrew-language notes that include LaTeX math formulas, code snippets, and mixed English terminology. This is the real-world scenario for Israeli CS/math students. The PDF must handle all of these together seamlessly.

**Why this priority**: This is the combined scenario that validates all individual features work together. Lower priority because it's composed of P1 and P2 stories.

**Independent Test**: Create a Hebrew document with inline LaTeX math, English terms, and code blocks. Export as PDF. Verify all elements render correctly together.

**Acceptance Scenarios**:

1. **Given** a Hebrew paragraph containing inline LaTeX `$O(n \log n)$`, **When** exported as PDF, **Then** the math renders as notation within the RTL text flow.
2. **Given** a Hebrew document with a display math block followed by Hebrew explanation text, **When** exported as PDF, **Then** both the math and the explanation render correctly with proper spacing.

---

### Edge Cases

- What happens when a math expression contains invalid LaTeX syntax? The PDF should render a visible error indicator or the raw LaTeX string as fallback — not silently omit the content.
- What happens when a document is empty? The export should produce a valid single-page PDF (matching current behavior).
- What happens when a single math expression or paragraph is very long? The content should wrap or paginate gracefully — not overflow off the page.
- What happens when the user exports while offline or the rendering service is unavailable? The system must show a clear error message explaining that an internet connection is required for PDF export. No client-side fallback is provided — this is consistent with the app already requiring internet for core functionality (Supabase sync).
- What happens when a document contains only canvas strokes with no text? The export should produce a PDF with the strokes rendered correctly.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST render LaTeX math expressions (both inline and display mode) as properly formatted mathematical notation in the exported PDF, matching the editor's visual output.
- **FR-002**: System MUST render Hebrew text with correct right-to-left direction and properly handle bidirectional text (Hebrew with inline English, numbers, or punctuation) following the Unicode BiDi algorithm.
- **FR-003**: System MUST produce PDF output that visually matches the editor's rendering for all supported TipTap node types: headings, paragraphs, bold, italic, underline, code, links, bullet lists, ordered lists, task lists, code blocks, blockquotes, and horizontal rules.
- **FR-004**: System MUST render freehand pen strokes as smooth vector paths in the exported PDF, preserving position, size, color, and stroke weight.
- **FR-005**: System MUST render text boxes on canvas pages at their correct position with proper text formatting.
- **FR-006**: System MUST handle mixed documents (canvas pages + text pages) by rendering each page type correctly in the correct order.
- **FR-007**: System MUST paginate text content across multiple pages, avoiding orphaned headings (headings at the bottom of a page with body text on the next page).
- **FR-008**: System MUST render page backgrounds (blank, lined, grid, dotted) correctly on canvas pages.
- **FR-009**: System MUST display a loading/progress indicator during PDF generation, since the new rendering pipeline may take longer than the current approach.
- **FR-010**: System MUST handle invalid LaTeX gracefully — showing a visible fallback (error indicator or raw source) rather than omitting content silently.
- **FR-011**: System MUST save the exported file with the document's title as the filename (sanitized for filesystem compatibility).
- **FR-012**: System MUST support the existing export entry points: the editor toolbar button and the dashboard document card context menu.

### Assumptions

- The current PDF page dimensions are acceptable: 794×1123pt for canvas pages and A4 (595×842pt) for text documents.
- The existing fonts (Geist Sans, Geist Mono) remain the primary fonts. Hebrew text will additionally require a font that supports Hebrew characters.
- The export is triggered by the user on-demand (not batch or scheduled).
- An internet connection may be required for the new rendering approach. This is acceptable as the app already requires internet for Supabase sync.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All LaTeX math expressions (inline and display) render as formatted notation in exported PDFs — 0% of math expressions appear as raw source text.
- **SC-002**: Hebrew documents with mixed English/number content export with correct bidirectional text rendering — text direction matches the editor for 100% of paragraphs.
- **SC-003**: PDF export completes within 10 seconds for a typical document (5-10 pages of mixed content).
- **SC-004**: All existing TipTap node types currently supported in export continue to render correctly — no regression in rich text fidelity.
- **SC-005**: Canvas page strokes render as vector paths (not rasterized images) — maintaining current quality.
- **SC-006**: The amount of custom rendering code is reduced by at least 50% compared to the current implementation, improving maintainability.
