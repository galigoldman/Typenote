# Feature Specification: Paste Images as Canvas Objects

**Feature Branch**: `040-image-paste-select`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "make it possible to paste an image, and then treat it as an object in select mode — make it possible to resize, and also make it automatically on select mode when we paste it."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Paste an Image onto the Canvas (Priority: P1)

A user copies an image from any source (browser, file explorer, screenshot tool) and pastes it onto the current page of the notebook. The image appears on the page as a visible object, and the editor automatically switches to select mode with the pasted image already selected — ready to be moved or resized immediately.

**Why this priority**: This is the core capability. Without paste support, no other image interaction is possible.

**Independent Test**: Can be fully tested by copying any image, pressing Ctrl/Cmd+V on a document page, and verifying the image appears on the canvas with selection handles visible.

**Acceptance Scenarios**:

1. **Given** a user has an image in their clipboard (e.g., a screenshot), **When** they press Ctrl/Cmd+V while viewing a document page, **Then** the image appears on the current page at a default position and the editor switches to select mode with the image selected.
2. **Given** a user is in draw mode or text mode, **When** they paste an image, **Then** the editor mode automatically changes to select mode and the pasted image is selected.
3. **Given** a user pastes an image, **When** the image is larger than the page dimensions, **Then** the image is scaled down to fit within the page boundaries while preserving its aspect ratio.
4. **Given** a user pastes clipboard content that is not an image (e.g., plain text), **When** the paste event fires, **Then** the existing paste behavior is preserved (no change to current text/drawing paste logic).

---

### User Story 2 - Move and Resize a Pasted Image (Priority: P1)

Once an image is on the canvas, the user can interact with it like other selectable objects. They can drag it to reposition it anywhere on the page and use resize handles to make it larger or smaller. Resizing preserves the image's aspect ratio so it doesn't get distorted.

**Why this priority**: Equal priority with paste — an image that can't be moved or resized has very limited value.

**Independent Test**: Can be tested by pasting an image, then dragging it to a new position and pulling a corner resize handle. The image should move smoothly and resize proportionally.

**Acceptance Scenarios**:

1. **Given** a pasted image is selected, **When** the user drags it, **Then** the image moves to the new position on the page.
2. **Given** a pasted image is selected, **When** the user drags a corner resize handle, **Then** the image resizes proportionally (aspect ratio locked).
3. **Given** a pasted image is selected, **When** the user drags an edge (midpoint) resize handle, **Then** the image resizes proportionally (aspect ratio locked) — same behavior as corners to prevent distortion.
4. **Given** a user tries to resize an image below a minimum visible size, **When** the resize would make it too small, **Then** the image stops shrinking at a minimum size threshold.
5. **Given** a user drags an image near the page edge, **When** the image would go off-page, **Then** the image is clamped to remain within page boundaries.

---

### User Story 3 - Select an Existing Image (Priority: P2)

After pasting, if the user switches to another mode (draw, text) and later returns to select mode, they can click/tap on the image to select it again. The image participates in rectangle selection alongside strokes.

**Why this priority**: Essential for ongoing interaction, but users will most often interact with images immediately after pasting (which is covered by P1).

**Independent Test**: Can be tested by pasting an image, switching to draw mode, drawing a stroke, switching back to select mode, then tapping on the image to verify it becomes selected with handles.

**Acceptance Scenarios**:

1. **Given** an image exists on the page and the user is in select mode, **When** they tap/click on the image, **Then** the image is selected and resize/move handles appear.
2. **Given** an image and strokes exist on the page, **When** the user draws a selection rectangle that covers both, **Then** both the image and the strokes are included in the selection.
3. **Given** an image is selected, **When** the user taps on empty space, **Then** the image is deselected.

---

### User Story 4 - Delete a Pasted Image (Priority: P2)

A user can delete an image by selecting it and pressing the delete/backspace key, or using the existing delete action for selected objects. Undo restores the deleted image.

**Why this priority**: Users need the ability to remove images they no longer want, but it's secondary to the core paste and manipulate flow.

**Independent Test**: Can be tested by pasting an image, selecting it, pressing Delete, verifying it disappears, then pressing Ctrl/Cmd+Z to undo and verifying it reappears.

**Acceptance Scenarios**:

1. **Given** an image is selected, **When** the user presses Delete or Backspace, **Then** the image is removed from the page.
2. **Given** an image was just deleted, **When** the user triggers undo, **Then** the image reappears at its previous position and size.

---

### User Story 5 - Image Persistence (Priority: P2)

When a user pastes an image onto a page, it is saved as part of the document data. When the user closes and reopens the document, the image appears in the same position and size.

**Why this priority**: Without persistence, images are lost on page reload — but it's a separate concern from the interaction model.

**Independent Test**: Can be tested by pasting an image, refreshing the page, and verifying the image is still present at the same position and size.

**Acceptance Scenarios**:

1. **Given** a user has pasted an image on a page, **When** they navigate away and return to the document, **Then** the image is rendered at the same position and size.
2. **Given** a document with images is exported to PDF, **When** the PDF is generated, **Then** the images appear in the PDF at their correct positions and sizes.

---

### Edge Cases

- What happens when the user pastes an extremely large image (e.g., 8000x6000 pixels)? The image should be scaled down to fit the page and the stored image data should be compressed/resized to a reasonable resolution to avoid excessive storage.
- What happens when the user pastes non-image clipboard data while in draw mode? Existing behavior should be preserved — only image data in the clipboard triggers the new image paste flow.
- What happens when the user pastes an image on a page that has no remaining space? The image is placed at the center of the page, overlapping existing content (images layer on top of strokes but below text boxes).
- What happens when the user copies and pastes the same image multiple times? Each paste creates an independent image object. They can be independently moved, resized, and deleted.
- What happens when the user selects multiple objects (images + strokes) and moves them? All selected objects move together, maintaining their relative positions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST accept image data from the system clipboard (pasted via Ctrl/Cmd+V) and place it on the current page as a positioned, visible object.
- **FR-002**: System MUST automatically switch to select mode when an image is pasted, with the new image pre-selected.
- **FR-003**: System MUST allow images to be moved by dragging when selected.
- **FR-004**: System MUST allow images to be resized via handles, always preserving the original aspect ratio.
- **FR-005**: System MUST enforce minimum size constraints during resize to prevent images from becoming invisibly small.
- **FR-006**: System MUST include images in rectangle selection alongside other selectable objects (strokes).
- **FR-007**: System MUST allow images to be deleted via keyboard (Delete/Backspace) when selected.
- **FR-008**: System MUST support undo/redo for image paste, move, resize, and delete operations.
- **FR-009**: System MUST persist images as part of the document data so they survive page reloads.
- **FR-010**: System MUST scale down images that exceed page dimensions to fit within the page, preserving aspect ratio.
- **FR-011**: System MUST render images at their correct positions and sizes when a document is loaded.
- **FR-012**: System MUST support selecting an image by tapping/clicking on it in select mode.
- **FR-013**: System MUST include pasted images in PDF exports at their correct positions and sizes.

### Key Entities

- **Image Object**: A positioned image on a canvas page. Key attributes: unique identifier, position (x, y), dimensions (width, height), image data (the actual pixel content), and creation timestamp.
- **Canvas Page**: Extended to contain a collection of image objects alongside existing strokes and text boxes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can paste an image from their clipboard and see it on the canvas within 1 second.
- **SC-002**: Pasted images are automatically selected and ready for manipulation (move/resize) without any additional user action.
- **SC-003**: Image resize maintains aspect ratio with zero visible distortion.
- **SC-004**: All image operations (paste, move, resize, delete) are fully undoable and redoable.
- **SC-005**: Images persist across page reloads with no loss of position, size, or visual quality.
- **SC-006**: Documents with images export to PDF with images rendered at correct positions.
