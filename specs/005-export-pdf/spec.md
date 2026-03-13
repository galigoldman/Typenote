# Feature Specification: Export as PDF

**Feature Branch**: `005-export-pdf`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "Export documents as PDF. Client-side PDF generation modeled after GoodNotes. Users can export any document (text-only with rich text, canvas with pen strokes and text boxes, or mixed) as a PDF. Vector strokes, selectable text via font embedding, page backgrounds (blank/lined/grid/dotted), and A4 pagination for text-only docs (Google Docs style). Two trigger points: editor toolbar button and dashboard document card context menu. Direct browser download with loading indicator."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Canvas Document from Editor (Priority: P1)

A student has finished taking handwritten notes on a canvas document with pen strokes, text boxes, and a lined background. They want to download a PDF to submit as homework or share with classmates. From the document editor, they click an "Export as PDF" button, see a brief loading indicator, and receive a downloaded PDF file that looks identical to what they see on screen — with crisp strokes, readable text they can select and copy, and the lined background intact.

**Why this priority**: This is the core use case. Canvas documents with hand-drawn content are the primary document type in Typenote and the most complex to export. If this works, the foundation supports all other document types.

**Independent Test**: Can be fully tested by creating a canvas document with strokes, text boxes, and a background pattern, clicking "Export as PDF" in the editor, and verifying the downloaded PDF contains all visual elements with selectable text.

**Acceptance Scenarios**:

1. **Given** a canvas document with pen strokes, text boxes, and a lined background is open in the editor, **When** the user clicks "Export as PDF", **Then** a PDF file downloads with the document title as filename, containing all strokes as crisp vector paths, all text boxes with selectable text, and the lined background pattern.
2. **Given** a canvas document with multiple pages (each with different background types), **When** the user exports as PDF, **Then** each canvas page becomes one PDF page with its respective background pattern preserved.
3. **Given** a canvas document with math expressions in text boxes, **When** exported as PDF, **Then** the math renders correctly in the PDF at the correct position.
4. **Given** the user clicks "Export as PDF", **When** the PDF is being generated, **Then** a loading indicator is visible until the download begins.

---

### User Story 2 - Export Text-Only Document from Editor (Priority: P2)

A student has typed lecture notes as a rich text document (headings, paragraphs, bullet lists, task lists, highlighted text, and LaTeX math). They want a clean, paginated PDF to print or review offline. From the editor, they export the document and receive a multi-page A4 PDF that looks like a printed Google Docs document — properly paginated with margins, page breaks, and all formatting preserved.

**Why this priority**: Text-only documents are the second major content type. They require a different rendering approach (pagination of flowing content rather than fixed-position canvas pages), but share the same font embedding and export UX.

**Independent Test**: Can be tested by creating a text document with mixed rich content (headings, lists, math, highlights), exporting as PDF, and verifying proper A4 pagination with selectable text and correct formatting.

**Acceptance Scenarios**:

1. **Given** a text-only document with headings, paragraphs, and lists, **When** the user exports as PDF, **Then** the content is paginated across A4 pages with consistent margins, and text is selectable in the PDF.
2. **Given** a text document long enough to span multiple pages, **When** exported, **Then** page breaks occur at natural points (not mid-line), and headings near the bottom of a page are pushed to the next page to avoid orphans.
3. **Given** a text document with LaTeX math expressions, **When** exported, **Then** math renders correctly inline with surrounding text.
4. **Given** a text document with task lists (checkboxes), **When** exported, **Then** checked and unchecked states are visually distinct in the PDF.

---

### User Story 3 - Export from Dashboard (Priority: P3)

A student is on the dashboard browsing their documents and wants to quickly export one without opening it first. They click the context menu ("...") on a document card and select "Export as PDF." The system fetches the document data and generates the PDF — same quality as exporting from the editor.

**Why this priority**: This is a convenience feature that reuses the same export engine. The core PDF generation is already built in P1/P2; this story only adds a new trigger point.

**Independent Test**: Can be tested by navigating to the dashboard, right-clicking a document card, selecting "Export as PDF", and verifying the downloaded PDF matches the document content.

**Acceptance Scenarios**:

1. **Given** the user is on the dashboard viewing document cards, **When** they open the context menu on a document card, **Then** an "Export as PDF" option is visible.
2. **Given** the user clicks "Export as PDF" from the dashboard context menu, **When** the document has canvas pages, **Then** the exported PDF is identical to what would be produced from the editor.
3. **Given** the user clicks "Export as PDF" from the dashboard, **When** the document data needs to be fetched, **Then** a loading indicator is shown until the download begins.

---

### User Story 4 - Export Mixed Document (Priority: P3)

A student has a document that contains both canvas pages (handwritten notes with strokes) and text content. When exported, the canvas pages appear first as fixed-layout pages, followed by the text content paginated as additional A4 pages.

**Why this priority**: Mixed documents are less common but must be handled correctly. The rendering logic for both types is already built in P1/P2; this story ensures they combine correctly.

**Independent Test**: Can be tested by creating a document with both canvas pages and text content, exporting, and verifying canvas pages come first followed by paginated text pages.

**Acceptance Scenarios**:

1. **Given** a document with canvas pages and text content, **When** exported as PDF, **Then** canvas pages appear first, followed by text content paginated into A4 pages.
2. **Given** a mixed document, **When** exported, **Then** the total page count equals the number of canvas pages plus the paginated text pages.

---

### Edge Cases

- What happens when a document has no content (empty document)? The system should export a single blank A4 page.
- What happens when a text document has a single very long paragraph that exceeds one page? It should wrap and continue on the next page, breaking between lines (never mid-character).
- What happens when a canvas stroke extends to the very edge of the page? It should be clipped to the page boundary in the PDF.
- What happens when the document title contains special characters (/, \, :, etc.)? The filename should sanitize these characters for safe download.
- What happens when export fails mid-generation? The user sees an error toast with a retry option; no partial file is downloaded.
- What happens when a text box on a canvas page is empty? It should be omitted from the PDF (no empty space artifact).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a PDF from any document type (text-only, canvas, or mixed) entirely within the browser with no server round-trip.
- **FR-002**: System MUST render pen strokes as vector paths in the PDF, preserving color, width, and opacity so they remain crisp at any zoom level.
- **FR-003**: System MUST render all text (in text boxes and text-only documents) as selectable, searchable PDF text using the same fonts displayed in the editor.
- **FR-004**: System MUST include page background patterns (blank, lined, grid, dotted) in the PDF, matching the pattern assigned to each page.
- **FR-005**: System MUST paginate text-only document content into A4-sized pages with consistent margins and natural page breaks (no mid-line splits, orphan headings pushed to next page).
- **FR-006**: System MUST provide an "Export as PDF" action in the document editor toolbar.
- **FR-007**: System MUST provide an "Export as PDF" action in the dashboard document card context menu.
- **FR-008**: System MUST download the PDF with the filename `{document title}.pdf`, sanitizing any characters unsafe for filenames.
- **FR-009**: System MUST display a loading indicator while the PDF is being generated.
- **FR-010**: System MUST show an error notification with a retry option if PDF generation fails.
- **FR-011**: System MUST render LaTeX math expressions correctly in the PDF, both inline within text and inside canvas text boxes.
- **FR-012**: For mixed documents, system MUST render canvas pages first, followed by paginated text content.
- **FR-013**: System MUST map each canvas page to exactly one PDF page, preserving the original page dimensions.
- **FR-014**: System MUST export an empty document as a single blank A4 page.

### Key Entities

- **Document**: The source entity containing a title, optional text content (rich text), and optional canvas pages (strokes, text boxes, background type). A document may have one or both content types.
- **Canvas Page**: A fixed-dimension page within a document, containing ordered strokes, positioned text boxes, and a background type (blank/lined/grid/dotted).
- **Stroke**: A pen mark on a canvas page defined by a series of pressure-sensitive points, with color, width, and opacity attributes.
- **Text Box**: A positioned rectangle on a canvas page containing rich text content.
- **PDF File**: The output artifact — a multi-page document containing vector graphics, embedded fonts, and selectable text, downloadable as a file.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can export any document as a PDF in under 5 seconds for documents with 10 or fewer pages.
- **SC-002**: 100% of text in the exported PDF is selectable and copyable.
- **SC-003**: Pen strokes in the PDF remain visually crisp when zoomed to 400%.
- **SC-004**: Page backgrounds in the PDF visually match the on-screen backgrounds (lined, grid, dotted patterns are present and correctly spaced).
- **SC-005**: Text-only documents are paginated into A4 pages with no content cut off at page boundaries.
- **SC-006**: The export feature is accessible from both the editor and the dashboard with no more than 2 clicks.
- **SC-007**: Users see feedback (loading indicator) within 200ms of initiating an export.

## Assumptions

- The app uses web-safe or embeddable fonts that can be registered with the PDF generation library.
- Canvas page dimensions (794x1123 points) map directly to PDF page units without scaling.
- The existing stroke smoothing logic (perfect-freehand) can be reused to generate the same outlines for PDF vector paths.
- Documents are unlikely to exceed 50 pages, so client-side generation performance is adequate.
- The browser's download API (Blob + anchor click) is supported in all target browsers.
- LaTeX math can be rendered to SVG format for embedding in the PDF.
