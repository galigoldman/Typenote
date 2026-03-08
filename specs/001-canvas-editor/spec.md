# Feature Specification: Freeform Canvas Editor

**Feature Branch**: `001-canvas-editor`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "GoodNotes/OneNote-style freeform canvas editor with pen drawing, eraser, selection/cut tool, A4 pages with infinite scroll, and pinch-to-zoom. Replaces current text-only editor with a hybrid model where typing works like a normal document by default, and canvas tools unlock freeform capabilities."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pen Drawing on the Canvas (Priority: P1)

A user opens a document and picks up their stylus (Apple Pencil, Surface Pen, or any compatible pen). They draw or handwrite on the page. The strokes appear in real time as they write and remain permanently on the page. The handwriting is saved to the document and persists across sessions.

**Why this priority**: This is the core capability of the entire feature. Without persistent pen strokes, nothing else (eraser, selection, pages) has meaning.

**Independent Test**: Can be fully tested by opening a document, drawing with a stylus, navigating away, and returning to verify the drawing persists.

**Acceptance Scenarios**:

1. **Given** a user has a stylus and a document is open, **When** they draw on the page with the pen tool active, **Then** ink strokes appear in real time following the stylus movement.
2. **Given** a user has drawn strokes on a document, **When** they navigate away and return to the document, **Then** all strokes are exactly as they were drawn.
3. **Given** a user is using a mouse or trackpad (not a stylus), **When** they attempt to draw, **Then** no drawing occurs — pen input is stylus-only.
4. **Given** a user draws across an A4 page boundary, **When** the stroke crosses from one page to the next, **Then** the stroke is correctly rendered across both pages.

---

### User Story 2 - Default Text Typing (Priority: P1)

A user opens a document and begins typing on their keyboard without selecting any tool. Text flows naturally from the beginning of the page (left-to-right or right-to-left depending on language), behaving exactly like a traditional document editor. No canvas tools interfere with normal typing.

**Why this priority**: The hybrid model depends on typing working seamlessly by default. Users should not feel any difference from a regular document until they choose to use canvas tools.

**Independent Test**: Can be tested by opening a document, typing text, verifying it flows normally, saving, and reopening.

**Acceptance Scenarios**:

1. **Given** a user opens a new document, **When** they begin typing on the keyboard, **Then** text appears at the top of the first A4 page, flowing naturally in the direction appropriate to their language.
2. **Given** a user has typed several paragraphs, **When** the text exceeds one A4 page, **Then** text flows onto the next page automatically.
3. **Given** a user is typing, **When** they have not interacted with any canvas tool, **Then** the experience is indistinguishable from a regular document editor.
4. **Given** a user has typed text with formatting (bold, lists, headings, math expressions), **When** they view the document, **Then** all formatting is preserved and rendered correctly.

---

### User Story 3 - Tool Switching (Priority: P1)

The toolbar displays three tool options: Pen, Eraser, and Selection/Cut tool. The user can switch between these tools at any time. The active tool is visually indicated. Keyboard typing works regardless of which tool is selected.

**Why this priority**: Tool switching is the interaction model that ties all other features together. Without clear tool management, the user experience breaks down.

**Independent Test**: Can be tested by switching between tools and verifying the active tool indicator updates and each tool behaves correctly.

**Acceptance Scenarios**:

1. **Given** the toolbar is visible, **When** the user views it, **Then** three tool options are displayed: Pen, Eraser, and Selection/Cut.
2. **Given** a tool is selected, **When** the user taps a different tool, **Then** the active tool switches and the toolbar visually indicates the new active tool.
3. **Given** any tool is active, **When** the user types on the keyboard, **Then** text input works normally regardless of the selected tool.
4. **Given** the pen tool is active, **When** the user uses the stylus on the canvas, **Then** ink strokes are drawn.
5. **Given** the eraser tool is active, **When** the user uses the stylus on a stroke, **Then** the stroke is erased.

---

### User Story 4 - Eraser Tool (Priority: P2)

A user selects the eraser tool from the toolbar and touches a pen stroke with their stylus or finger. The entire stroke that was touched disappears from the canvas.

**Why this priority**: Erasing is essential for a usable drawing experience — users need to correct mistakes. It is the simplest of the three tools after the pen.

**Independent Test**: Can be tested by drawing several strokes, switching to the eraser, touching one stroke, and verifying only that stroke is removed.

**Acceptance Scenarios**:

1. **Given** the eraser tool is active and strokes exist on the page, **When** the user touches a stroke, **Then** the entire stroke is removed from the canvas.
2. **Given** the eraser tool is active, **When** the user touches an area with no strokes, **Then** nothing happens.
3. **Given** the eraser tool is active, **When** the user drags across multiple strokes, **Then** each stroke that is touched is removed.
4. **Given** a stroke was erased, **When** the user saves and reopens the document, **Then** the erased stroke does not reappear.

---

### User Story 5 - Selection and Move Tool (Priority: P2)

A user selects the selection/cut tool from the toolbar and draws a selection area (rectangle or freeform lasso) around objects on the canvas. The selected objects (handwriting strokes, text boxes, math expressions) become highlighted and can be dragged to a new position on the page.

**Why this priority**: Selection and movement is what makes the canvas truly freeform. It enables users to reorganize their content spatially, which is the key differentiator from a regular document.

**Independent Test**: Can be tested by placing content on the canvas, selecting it with the cut tool, and dragging it to a new position.

**Acceptance Scenarios**:

1. **Given** the selection tool is active and content exists on the page, **When** the user draws a rectangle around content, **Then** all objects within the rectangle are selected and visually highlighted.
2. **Given** the selection tool is active, **When** the user draws a freeform lasso shape around content, **Then** all objects within the lasso are selected.
3. **Given** objects are selected, **When** the user drags the selection, **Then** all selected objects move together to the new position.
4. **Given** a text block is partially selected (the selection boundary cuts through the middle of a text block), **When** the selection is confirmed, **Then** the text is split into two separate text boxes at the selection boundary.
5. **Given** objects have been moved, **When** the user saves and reopens the document, **Then** all objects remain in their new positions.

---

### User Story 6 - A4 Pages with Infinite Scroll (Priority: P2)

The document displays as a continuous vertical scroll of A4-sized pages with visible page boundaries. As the user adds content beyond the current last page, a new blank A4 page is automatically created. Users scroll vertically through all pages seamlessly.

**Why this priority**: A4 pages provide the structural framework that all content lives on. Pages are needed before content layout is meaningful.

**Independent Test**: Can be tested by opening a document, observing A4 page boundaries, adding content that exceeds one page, and verifying a new page appears.

**Acceptance Scenarios**:

1. **Given** a user opens a new document, **When** the document loads, **Then** at least one A4-proportioned page is displayed with visible boundaries.
2. **Given** the user is on the last page, **When** content (text or drawing) extends past the bottom of the page, **Then** a new blank A4 page is automatically added below.
3. **Given** multiple pages exist, **When** the user scrolls vertically, **Then** the transition between pages is smooth and continuous with visible page breaks.
4. **Given** an empty page exists at the end with no content, **When** no content is added to it, **Then** the empty trailing page may be automatically removed upon saving (keeping at least one page).

---

### User Story 7 - Pinch-to-Zoom (Priority: P3)

On touch devices, the user places two fingers on the screen and pinches or spreads to zoom out or zoom in on the document. The zoom is smooth and centered on the midpoint between the two fingers.

**Why this priority**: Zoom is important for usability but not a blocker for core drawing and editing. The feature is fully usable at default zoom level.

**Independent Test**: Can be tested on a touch device by placing two fingers on the screen and pinching/spreading, then verifying the document zooms accordingly.

**Acceptance Scenarios**:

1. **Given** a user is viewing a document on a touch device, **When** they pinch two fingers together, **Then** the document zooms out smoothly.
2. **Given** a user is viewing a document on a touch device, **When** they spread two fingers apart, **Then** the document zooms in smoothly.
3. **Given** the user has zoomed in, **When** they draw or type, **Then** input is accurately placed at the correct position on the canvas (no offset due to zoom).
4. **Given** the user has zoomed in or out, **When** they lift their fingers, **Then** the zoom level is maintained until changed again.

---

### Edge Cases

- What happens when the user draws very rapidly with many strokes? The system must remain responsive without dropping strokes.
- What happens when the user tries to move a selection to a different page? The objects should move to the target page.
- What happens when text is split by the selection tool at an inline element (e.g., mid-word, inside a math expression)? The split should occur at the nearest logical boundary (word/paragraph break or around the math expression).
- What happens when the user zooms in very far and draws? Strokes should be precise at the zoomed-in scale.
- What happens on a device without stylus support? Pen and eraser tools should be unavailable or disabled. Typing and scrolling should work normally.
- What happens when a document with drawings is opened on a device without canvas support? The document should still display text content gracefully.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render the document as a continuous vertical scroll of A4-proportioned pages with visible page boundaries.
- **FR-002**: System MUST automatically create new blank A4 pages when content extends beyond the current last page.
- **FR-003**: System MUST provide a pen tool that captures stylus input and renders ink strokes in real time on the canvas.
- **FR-004**: System MUST accept pen input only from stylus devices (Apple Pencil, Surface Pen, etc.), not from mouse or trackpad.
- **FR-005**: System MUST persist all pen strokes as part of the document data, surviving page reloads and session changes.
- **FR-006**: System MUST provide an eraser tool that removes entire strokes when touched.
- **FR-007**: System MUST provide a selection/cut tool that supports both rectangular and freeform lasso selection of objects.
- **FR-008**: System MUST allow selected objects (strokes, text boxes, math expressions) to be dragged and repositioned anywhere on the canvas.
- **FR-009**: When the selection tool partially selects a text block, the system MUST split the text into two independent text boxes at the selection boundary.
- **FR-010**: System MUST display a toolbar with three tool options (Pen, Eraser, Selection/Cut) with clear visual indication of the active tool.
- **FR-011**: System MUST support keyboard text input at all times, regardless of which tool is active. By default, text flows from the start of the page like a regular document.
- **FR-012**: System MUST support pinch-to-zoom gestures on touch devices, smoothly zooming in and out centered on the gesture midpoint.
- **FR-013**: System MUST maintain accurate input positioning (drawing and typing) at all zoom levels.
- **FR-014**: The pen tool MUST render strokes in black with a single default thickness.
- **FR-015**: System MUST save moved/repositioned objects in their new positions, persisting across sessions.
- **FR-016**: System MUST preserve all existing text formatting capabilities (bold, italic, lists, headings, math expressions, etc.) within the text flow and within text boxes.

### Key Entities

- **Stroke**: A single continuous pen mark on the canvas. Contains a series of points with coordinates relative to the page. Belongs to a specific page.
- **Page**: An A4-proportioned area within the document. Contains strokes and positioned content objects. Pages are ordered sequentially.
- **Text Box**: A container for rich text content. Can be in "flow mode" (default document text) or "positioned mode" (after being cut/moved by the selection tool). Positioned text boxes have explicit x/y coordinates on a page.
- **Document**: The top-level entity. Contains an ordered list of pages, each with their strokes and content objects.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can draw with a stylus and see their strokes appear in under 50ms (real-time feel), with all strokes persisting after page reload.
- **SC-002**: Users can type text that flows naturally across A4 pages, with the experience being indistinguishable from a traditional document editor when no canvas tools are used.
- **SC-003**: Users can erase any stroke with a single touch of the eraser tool, with the stroke disappearing immediately.
- **SC-004**: Users can select and move any combination of objects (strokes, text, math) to a new position in under 3 seconds (select + drag).
- **SC-005**: The selection tool correctly splits text blocks when a partial selection is made, producing two independently movable text boxes.
- **SC-006**: New A4 pages are automatically created as content grows, with no manual page management required.
- **SC-007**: Pinch-to-zoom operates smoothly on touch devices with drawing and typing remaining accurately positioned at all zoom levels.
- **SC-008**: Tool switching between Pen, Eraser, and Selection is instantaneous with clear visual feedback of the active tool.
- **SC-009**: Documents with 500+ strokes across 10+ pages load and remain responsive during editing.

## Assumptions

- The existing rich text editor (TipTap) will be adapted to work within positioned text boxes on the canvas, preserving all current formatting capabilities.
- Stylus detection will distinguish between pen, touch, and mouse input types to ensure pen-only drawing.
- The A4 page proportions follow the standard 210mm x 297mm ratio, scaled to fit the viewport width.
- Two-finger touch gestures are reserved for navigation (zoom/scroll) and will not trigger drawing or erasing.
- The existing auto-save and real-time sync mechanisms will be extended to handle the new canvas data (strokes, object positions).
- Math expressions are already implemented in the current editor and will continue to work within text boxes on the canvas.
