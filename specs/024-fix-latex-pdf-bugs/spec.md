# Feature Specification: Fix LaTeX Text Box Cutoff and PDF Import Empty Page

**Feature Branch**: `024-fix-latex-pdf-bugs`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "the latex ai text box sometimes get cut when writing, and also pdf import does not load (show empty page)"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - PDF Import Renders Pages Correctly (Priority: P1)

A user imports a PDF file from their personal files. After import, the document opens and displays the actual PDF pages as backgrounds — the same way course material PDFs render. Currently, importing a personal-file PDF creates pages with the correct `pdfPage` index but the viewer shows blank pages because the PDF rendering pipeline only supports course materials, not personal files.

**Why this priority**: An empty page after import is a critical data-visibility failure — the user sees nothing and has no workaround. This is the higher-impact bug because the feature is completely non-functional for personal-file PDFs.

**Independent Test**: Import a multi-page PDF via the personal files flow, open the resulting document, and verify every page shows the correct PDF content as its background.

**Acceptance Scenarios**:

1. **Given** a user has uploaded a 3-page PDF through personal file import, **When** they open the created document, **Then** all 3 pages display the correct PDF page content as their background.
2. **Given** a user has a document created from a personal-file PDF, **When** they switch between pages, **Then** each page renders the matching PDF page without delay or blank flashes.
3. **Given** a user opens a document originally created from a course-material PDF, **When** they view it, **Then** it continues to render correctly (no regression).

---

### User Story 2 - LaTeX Input Box Does Not Cut Off Content (Priority: P2)

A user types a description into the LaTeX AI input box (the math input popup that converts natural language to LaTeX). When the text is long, the input field truncates the visible text — the user cannot see what they are typing. The input box should accommodate the full text without cutting it off.

**Why this priority**: The feature still works (the user can submit and get LaTeX), but the truncated input creates a poor editing experience that makes it hard to review and correct descriptions before submission.

**Independent Test**: Open the LaTeX input box, type a description that exceeds the current visible width, and verify the entire text remains visible or scrollable.

**Acceptance Scenarios**:

1. **Given** a user opens the LaTeX AI input box, **When** they type a description longer than 40 characters, **Then** the full text remains visible (either by expanding the input width or allowing horizontal scroll).
2. **Given** a user is typing in the LaTeX input box, **When** the text approaches the character limit (500 characters), **Then** the input does not visually clip or hide any portion of the entered text.
3. **Given** a user has typed a long description in the LaTeX input box, **When** they move the cursor to edit earlier text, **Then** the cursor position and surrounding text are visible.

---

### Edge Cases

- What happens when a personal-file PDF is corrupted or has zero extractable pages?
- What happens when a personal-file PDF has been deleted from storage but the document still references it?
- What happens when the LaTeX input box is opened on a very narrow screen or mobile viewport?
- What happens when a document was created from a personal-file PDF and the user also has course-material PDFs open — do both render correctly side by side?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST render PDF page backgrounds for documents created from personal file imports, using the same visual quality as course-material PDFs.
- **FR-002**: System MUST resolve the correct storage location (personal files storage) when loading PDFs for personal-file-linked documents.
- **FR-003**: System MUST pass the personal file identifier to the PDF rendering pipeline when a document is linked to a personal file rather than a course material.
- **FR-004**: System MUST continue to render course-material PDFs correctly (no regression).
- **FR-005**: System MUST display a meaningful error state (not a blank page) when a linked PDF file cannot be loaded (e.g., deleted from storage, corrupted).
- **FR-006**: The LaTeX input box MUST display the full text the user has typed without visual clipping or truncation.
- **FR-007**: The LaTeX input box MUST remain usable on viewports as narrow as 320px.

### Key Entities

- **Document**: Represents a note document. Can be linked to either a course material (`material_id`) or a personal file (`personal_file_id`). Contains a `pages` array where each page may reference a `pdfPage` index.
- **Personal File**: A user-uploaded file stored in dedicated personal-files storage. Has its own storage path for retrieval.
- **Course Material**: A file associated with a course, stored in course-materials or moodle-materials storage. Currently the only source supported by the PDF rendering pipeline.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of documents created from personal-file PDF imports display the correct PDF content on every page when opened.
- **SC-002**: Users can read and edit the full text of a LaTeX description up to 500 characters in the input box without any portion being hidden or clipped.
- **SC-003**: Existing documents linked to course-material PDFs continue to render correctly with zero regressions.
- **SC-004**: When a linked PDF cannot be loaded, the user sees a clear error message instead of a blank page.
