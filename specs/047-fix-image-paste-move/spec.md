# Feature Specification: Fix Image Paste Target & Cross-Page Object Movement

**Feature Branch**: `047-fix-image-paste-move`
**Created**: 2026-05-24
**Status**: Draft
**Input**: User description: "right now when pasting an image inside the document it pastes it to the first page regardless which page we are on, this needs to be fixed, the image should appear where the cursor is, and also I want it to be possible to move an image and objects in general, between pages."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Paste Image on Current Page (Priority: P1)

A user is working on page 3 of a multi-page document. They copy an image from an external source (browser, file manager) and press Ctrl+V / Cmd+V. The image appears on page 3 near the cursor position, not on page 1.

**Why this priority**: This is a bug fix for a broken core workflow. Users expect pasted content to appear where they're working, not on a distant page. The current behavior forces users to manually move every pasted image.

**Independent Test**: Paste an image while viewing page 3 of a 5-page document. Verify the image appears on page 3 at a reasonable position near the viewport center or cursor location.

**Acceptance Scenarios**:

1. **Given** a multi-page document with the user scrolled to page 3, **When** the user pastes an image from the system clipboard, **Then** the image appears on page 3 (the page most visible in the viewport).
2. **Given** a multi-page document with the user scrolled between page 2 and page 3 (both partially visible), **When** the user pastes an image, **Then** the image appears on whichever page occupies more of the viewport center area.
3. **Given** a single-page document, **When** the user pastes an image, **Then** the image appears on that page (current behavior preserved).
4. **Given** a multi-page document with the user scrolled to the last page, **When** the user pastes an image, **Then** the image appears on the last page, and a new blank page is added after it if needed for continued editing.

---

### User Story 2 - Move Objects Between Pages via Drag (Priority: P2)

A user has an image (or other selected objects like strokes or text boxes) on page 2 and wants to move it to page 3. They select the object, drag it past the bottom edge of page 2, and it transfers to page 3.

**Why this priority**: Cross-page movement enables flexible document layout. Without it, users must delete objects and re-create them on the target page, which is tedious and error-prone.

**Independent Test**: Select an image on page 2, drag it downward past the page boundary. Verify the image is removed from page 2 and added to page 3 at the correct position.

**Acceptance Scenarios**:

1. **Given** an image selected on page 2, **When** the user drags it past the bottom boundary of page 2, **Then** the image is moved to page 3 at the corresponding position (top area of page 3).
2. **Given** an image selected on page 3, **When** the user drags it past the top boundary of page 3, **Then** the image is moved to page 2 at the corresponding position (bottom area of page 2).
3. **Given** multiple objects selected (images, strokes, text boxes) on the same page, **When** the user drags the selection across a page boundary, **Then** all selected objects move together to the target page, maintaining their relative positions.
4. **Given** an object on the first page, **When** the user drags it above the top boundary, **Then** the object stays on page 1 (no page exists above).
5. **Given** an object on the last page, **When** the user drags it below the bottom boundary, **Then** a new blank page is created and the object moves to it.

---

### User Story 3 - Move Objects Between Pages via Cut/Paste (Priority: P3)

A user selects an object on page 1, cuts it (Ctrl+X / Cmd+X), scrolls to page 4, and pastes it (Ctrl+V / Cmd+V). The object appears on page 4.

**Why this priority**: Cut/paste is a familiar interaction for repositioning content across distant pages. Drag only works for adjacent pages, so cut/paste covers the long-range case.

**Independent Test**: Select an image on page 1, cut it, scroll to page 4, paste. Verify the image appears on page 4.

**Acceptance Scenarios**:

1. **Given** a selected image on page 1, **When** the user cuts it and pastes on page 4, **Then** the image is removed from page 1 and appears on page 4 at the viewport center position.
2. **Given** a selected group of objects (strokes + images), **When** the user cuts and pastes on a different page, **Then** all objects appear on the target page with their relative positions preserved.
3. **Given** nothing is selected, **When** the user presses paste, **Then** nothing happens for the internal clipboard (system clipboard paste of external images still works as per User Story 1).

---

### Edge Cases

- What happens if an object is dragged to a position that overlaps a page gap (the space between rendered pages)? The object should snap to the nearest page rather than disappearing.
- What happens if the user undoes a cross-page move? The object should return to its original page and position in a single undo step.
- What happens if a cross-page drag would result in objects going off-canvas (negative Y on page 1 or beyond the bottom of the last page)? The system should clamp the object position to valid bounds or create a new page as needed.
- What happens if the target page is removed during undo after a cross-page move? The undo system should restore the page if needed, or move the object to the nearest valid page.
- What happens when pasting a very large image that exceeds page dimensions? Existing image compression/resize behavior should continue to apply regardless of which page receives the image.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST place pasted external images on the page currently most visible in the viewport, not the first page.
- **FR-002**: System MUST allow users to drag any selected object (image, stroke, text box) from one page to an adjacent page by dragging past the page boundary.
- **FR-003**: System MUST move all objects in a multi-object selection together when crossing a page boundary, preserving their relative layout.
- **FR-004**: System MUST support cross-page movement via cut (Ctrl+X / Cmd+X) and paste (Ctrl+V / Cmd+V) to any page in the document.
- **FR-005**: System MUST create a new blank page when an object is dragged below the last page boundary.
- **FR-006**: System MUST record cross-page moves as a single undoable action so one undo restores the original state.
- **FR-007**: System MUST prevent objects from being placed in the gap between pages; objects must always belong to exactly one page.
- **FR-008**: System MUST clamp object positions to stay within valid page bounds after a cross-page move.

### Key Entities

- **CanvasPage**: A single page in the document containing arrays of strokes, text boxes, and images. Each has a unique ID and order index.
- **ImageObject**: A positioned image on a page with coordinates (x, y), dimensions (width, height), and base64 source data.
- **Selection**: The set of currently selected objects (images, strokes, text boxes) on a single page, tracked by the selection system.
- **UndoAction**: A recorded state change that can be reversed. Cross-page moves require a compound undo action that restores objects to their source page.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pasted images appear on the correct (currently visible) page 100% of the time, regardless of document length or scroll position.
- **SC-002**: Users can move any object type between adjacent pages in under 2 seconds via drag, without needing to delete and recreate.
- **SC-003**: Users can move objects between any two pages in the document via cut/paste in under 5 seconds.
- **SC-004**: Undoing a cross-page move restores the object to its original page and position in a single undo step.
- **SC-005**: All existing single-page editing workflows (drawing, typing, selecting, resizing, deleting) continue to work without regression.

## Assumptions

- The existing viewport-based page detection logic is the right approach for determining the target page for paste; it just needs a better fallback than "first page."
- Cross-page drag targets only adjacent pages (one page up or down). Moving objects across multiple pages at once requires cut/paste.
- The existing image compression and resize pipeline does not need changes; this feature only affects where images are placed and how objects move between pages.
- The internal clipboard (copy/paste within the editor) already tracks a `sourcePageId`; paste target should use the currently visible page rather than the source page.
