# Feature Specification: Inline Material Viewer

**Feature Branch**: `008-inline-material-viewer`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "When importing material into notebook for specific week or anything, opening them should work, but open inside a notebook, not in a different tab. The PDF should be opened like a regular document — you can paint on, zoom, highlight, and use all regular document features."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Open Material as a Full Document (Priority: P1)

A student is on their course page and sees materials listed under a week. They click on a material (e.g., a lecture PDF). Instead of the file opening in a new browser tab, the app navigates to the same canvas editor used for regular documents — but with the PDF pages rendered as the background of each canvas page. The student gets the full document experience: drawing, highlighting, pen tools, eraser, zoom, text — everything they can do on a regular document, now on top of their course material.

**Why this priority**: This is the core feature. Currently, materials open in a raw browser PDF viewer in a new tab with no annotation capability. By opening materials inside the existing canvas editor, students can actively engage with the material — highlight key passages, annotate diagrams, write notes directly on lecture slides — using the same tools they already know.

**Independent Test**: Can be fully tested by navigating to a course page, clicking a material, and verifying the app opens the canvas editor with PDF pages as backgrounds and all drawing/annotation tools functional.

**Acceptance Scenarios**:

1. **Given** a student is on the course page and sees materials listed under a week, **When** they click on a material item, **Then** the app navigates to the canvas editor page with the PDF rendered as the document background (not a new browser tab).
2. **Given** the material is open in the canvas editor, **When** the student uses the pen tool to draw on the page, **Then** strokes appear on top of the PDF content, just like drawing on a regular document.
3. **Given** the material is open in the canvas editor, **When** the student uses the highlighter tool, **Then** semi-transparent highlight strokes appear over the PDF content.
4. **Given** the material is open in the canvas editor, **When** the student uses zoom controls, **Then** both the PDF background and any annotations scale together.
5. **Given** a student clicks a material that was imported from Moodle, **When** the editor loads, **Then** the material renders identically to directly uploaded materials.

---

### User Story 2 - Navigate Multi-Page PDF Materials (Priority: P1)

A student opens a lecture PDF that has multiple pages (e.g., 30 slides). Each PDF page appears as a separate canvas page in the editor, matching how multi-page documents already work. The student can scroll through pages and annotate any page individually.

**Why this priority**: Most course materials are multi-page. Without this, the feature is incomplete for real-world use.

**Independent Test**: Can be tested by opening a multi-page PDF and verifying each page is rendered as a separate canvas page with correct content and independent annotation capability.

**Acceptance Scenarios**:

1. **Given** a student opens a multi-page PDF material, **When** the editor loads, **Then** each PDF page is rendered as a separate canvas page in the editor.
2. **Given** a multi-page material is open, **When** the student scrolls through pages, **Then** they can navigate between all pages of the PDF.
3. **Given** a multi-page material is open, **When** the student draws on page 5 and then scrolls to page 10 and draws there, **Then** annotations on both pages are preserved independently.

---

### User Story 3 - Save Annotations on Materials (Priority: P1)

After annotating a material (drawing, highlighting, writing notes), the student's work is saved — so when they reopen the same material later, all their annotations are still there. This works the same way regular document saving works.

**Why this priority**: Without persistence, annotations are lost on navigation. Students need to trust that their work on materials is saved, just like their regular documents.

**Independent Test**: Can be tested by opening a material, adding annotations, navigating away, returning to the same material, and verifying all annotations are preserved.

**Acceptance Scenarios**:

1. **Given** a student has drawn annotations on a material, **When** they navigate away and later return to the same material, **Then** all their annotations are preserved exactly as they left them.
2. **Given** a student is annotating a material, **When** changes are made, **Then** the system auto-saves annotations (same behavior as regular documents).
3. **Given** multiple students have the same material imported, **When** each student annotates their copy, **Then** each student's annotations are independent and private.

---

### User Story 4 - Navigate Back to Course (Priority: P2)

After viewing/annotating a material, the student can easily navigate back to the course page using breadcrumbs or the browser back button — the same navigation pattern as document pages.

**Why this priority**: Important for usability but the navigation infrastructure already exists for documents.

**Independent Test**: Can be tested by opening a material from a course page and verifying breadcrumb links and back-button behavior return to the correct course/week.

**Acceptance Scenarios**:

1. **Given** a student is viewing a material in the editor, **When** they click a breadcrumb link, **Then** they navigate back to the course page.
2. **Given** a student opened a material from a course page, **When** they press the browser back button, **Then** they return to the course page.

---

### Edge Cases

- What happens when the PDF file fails to load (e.g., storage file was deleted, network error)?
- What happens with very large PDFs (e.g., 40MB, hundreds of pages) — how does this affect page rendering performance?
- What happens when the signed URL expires while the student is actively annotating (URLs currently last 1 hour)?
- What happens if the student navigates directly to a material URL without being authenticated?
- What happens if the student navigates to a material that belongs to a different user?
- What happens with scanned PDFs (image-based, no selectable text) vs. text-based PDFs?
- How does the eraser tool interact with the PDF background — can the student erase only their annotations, not the PDF content?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST open course materials in the existing canvas editor (same editor used for regular documents) instead of opening in a new browser tab.
- **FR-002**: The canvas editor MUST render each PDF page as the background layer of a canvas page, with student annotations rendered on top.
- **FR-003**: All existing document tools MUST work on material pages: pen, highlighter, eraser, text input, zoom, undo/redo, and background selection (if applicable).
- **FR-004**: The eraser tool MUST only erase student annotations — the underlying PDF content MUST remain unaffected.
- **FR-005**: Multi-page PDFs MUST be rendered as multiple canvas pages, one per PDF page, maintaining correct page order.
- **FR-006**: Student annotations on materials MUST be auto-saved and persisted, following the same save mechanism as regular documents.
- **FR-007**: Each student's annotations MUST be private and independent — annotating a shared material does not affect other students' copies.
- **FR-008**: The material editor page MUST work for materials from both storage sources (direct uploads and Moodle imports).
- **FR-009**: The material editor page MUST show a loading state while the PDF is being fetched and rendered.
- **FR-010**: The material editor page MUST display a clear error message if the PDF cannot be loaded, with an option to navigate back.
- **FR-011**: The material editor page MUST be protected by authentication — only the material's owner can view and annotate their materials.
- **FR-012**: The material editor page MUST include breadcrumb navigation showing the path back to the course and week.

### Key Entities

- **Course Material**: An uploaded or imported file (currently PDF only) associated with a course week. Key attributes: file name, storage path, storage source, MIME type, file size, owning user, associated week.
- **Material Annotations**: The student's drawings, highlights, and text overlaid on a material. These are per-student, per-material, and persistent. Conceptually equivalent to the `pages` data on a regular document.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Students can open and interact with any course material without leaving the application — zero new browser tabs opened for material viewing.
- **SC-002**: Students can use all existing document tools (pen, highlighter, eraser, zoom, text, undo/redo) on material pages with no degradation in tool behavior.
- **SC-003**: Material annotations persist across sessions — a student's work is preserved when they navigate away and return.
- **SC-004**: Material content (PDF pages) becomes visible within 5 seconds of clicking a material item (for files under 10MB on standard broadband).
- **SC-005**: 100% of material sources (direct uploads and Moodle imports) are openable in the canvas editor.

## Assumptions

- Only PDF materials need to be supported initially, as the system currently restricts uploads to PDFs only.
- Each PDF page maps to one canvas page — the PDF page dimensions determine the canvas page dimensions (or are scaled to fit).
- The PDF background is a static rendered image per page — students cannot select or copy text from the PDF within the editor.
- Annotations are stored using the same data model as regular document pages (strokes, text content in `pages` JSONB), with the addition of a reference to the PDF background.
- The existing auto-save and sync mechanisms for documents will be reused for material annotations.
- Authentication and authorization follow the same pattern as document pages — only the owning user can access their annotated materials.
