# Feature Specification: DOCX Export

**Feature Branch**: `032-docx-export`
**Created**: 2026-04-04
**Status**: Draft
**Input**: "Add DOCX export with precise spacing, line breaks, and editable math expressions"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Export text document as DOCX (Priority: P1)

A user has a text document with headings, paragraphs, lists, and formatting. They click "Export as DOCX" and get a .docx file that opens correctly in Word and Google Docs. The spacing and line breaks match exactly what they see in the editor — no missing gaps, no collapsed paragraphs.

**Why this priority**: This is the core feature. Most documents are text-based lecture notes and homework.

**Independent Test**: Open a document with mixed content (headings, lists, bold text, links), export as DOCX, open in Word/Google Docs. Verify formatting matches.

**Acceptance Scenarios**:

1. **Given** a text document with headings, paragraphs, and lists, **When** the user clicks "Export as DOCX", **Then** a .docx file downloads with the document title as filename.
2. **Given** the exported DOCX, **When** opened in Word, **Then** headings appear as Word heading styles, bold/italic/underline are preserved, and lists are properly formatted.
3. **Given** a document with multiple paragraphs and blank lines, **When** exported as DOCX, **Then** the exact spacing and line breaks from the editor are preserved — no collapsed or missing whitespace.

---

### User Story 2 - Math expressions export as editable Word equations (Priority: P1)

A user has a document with LaTeX math expressions (e.g., `x^2 + y^2 = z^2`). When exported as DOCX, the math appears as native Word equations that can be clicked and edited in Word — not as images.

**Why this priority**: Math is a core feature of Typenote. Students need to submit homework in Word format with editable equations.

**Independent Test**: Create a document with inline math, export as DOCX, open in Word, click on the equation — it should be editable.

**Acceptance Scenarios**:

1. **Given** a document with LaTeX math expressions, **When** exported as DOCX, **Then** each math expression appears as a native Word equation (OMML format).
2. **Given** the exported DOCX opened in Word, **When** the user clicks on a math equation, **Then** Word's equation editor opens and the math is editable.
3. **Given** the exported DOCX opened in Google Docs, **When** viewing the document, **Then** math expressions display correctly (even if not editable).

---

### User Story 3 - Export button in UI (Priority: P1)

The "Export as DOCX" option appears in the same places as "Export as PDF" — in the document card menu on the dashboard, and in the editor toolbar. For canvas documents (with drawings), only PDF export is available.

**Why this priority**: Users need to find the button. It goes where they already look for export.

**Independent Test**: Log in, see "Export as DOCX" in the document card dropdown menu and in the editor toolbar.

**Acceptance Scenarios**:

1. **Given** a text document card on the dashboard, **When** the user opens the options menu, **Then** "Export as DOCX" appears alongside "Export as PDF".
2. **Given** a text document open in the editor, **When** the user looks at the toolbar, **Then** an "Export as DOCX" button is visible.
3. **Given** a canvas document (with drawn pages), **When** the user opens the options menu, **Then** only "Export as PDF" is available — no DOCX option.

---

### Edge Cases

- What happens when a document has no content (empty)? Export an empty DOCX with just the title.
- What happens when a math expression has invalid LaTeX? Fall back to plain text of the LaTeX code.
- What happens when a document has RTL (Hebrew) text? The DOCX should preserve text direction.
- What happens when a document has code blocks? Export as monospace text with background shading.
- What happens when a document has task lists with checkboxes? Export as bullet list with checkbox characters.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Text documents MUST be exportable as .docx files that open in Microsoft Word and Google Docs.
- **FR-002**: Exported DOCX MUST preserve exact spacing and line breaks as shown in the editor.
- **FR-003**: LaTeX math expressions MUST export as native Word equations (OMML/MathML format), not images.
- **FR-004**: All text formatting MUST be preserved: bold, italic, underline, strikethrough, highlight, links.
- **FR-005**: Headings MUST export as Word heading styles (Heading 1, 2, 3).
- **FR-006**: Bullet lists, numbered lists, and task lists MUST export as Word list styles.
- **FR-007**: Code blocks MUST export with monospace font.
- **FR-008**: Blockquotes MUST export with visual distinction (indent or border).
- **FR-009**: The "Export as DOCX" button MUST appear in the document card dropdown and editor toolbar.
- **FR-010**: Canvas documents (with drawn pages) MUST NOT show the DOCX export option.
- **FR-011**: The exported filename MUST be `{document title}.docx`.
- **FR-012**: RTL text direction MUST be preserved in the exported DOCX.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A document with headings, lists, bold, italic, and math exports as a valid .docx that opens without errors in Word and Google Docs.
- **SC-002**: Math expressions in the exported DOCX are editable when clicked in Word's equation editor.
- **SC-003**: Line breaks and paragraph spacing in the DOCX match what the user sees in the editor.
- **SC-004**: Export completes within 3 seconds for a typical document (10 pages of text + math).
