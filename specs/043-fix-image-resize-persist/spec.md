# Feature Specification: Fix Image Resize and Position Not Persisting

**Feature Branch**: `043-fix-image-resize-persist`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "I want you to fix a bug with an image paste. when pasting an image, and then resizing, after I go to dashboard and then go back to the page, the image went back to the way it was originally pasted without the resize. So the fix- save the exact location and size of the image when moving or resizing it"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Image Resize Persists After Navigation (Priority: P1)

A user pastes an image onto a document page and uses the resize handles to make it larger or smaller. They then navigate to the dashboard (or any other page within the app) and return to the document. The image should appear at the resized dimensions -- not reverted to the original paste size.

**Why this priority**: This is the exact bug the user reported. Without this fix, image resizing is effectively useless since changes are lost on navigation.

**Independent Test**: Can be fully tested by pasting an image, resizing it, navigating to the dashboard, returning to the document, and verifying the image is at the resized dimensions.

**Acceptance Scenarios**:

1. **Given** a user has pasted an image and resized it using corner handles, **When** they navigate to the dashboard and return to the document, **Then** the image appears at the resized width and height (not the original paste dimensions).
2. **Given** a user has pasted an image and resized it, **When** they close the browser tab and reopen the document, **Then** the image appears at the resized dimensions.
3. **Given** a user resizes an image and navigates away within 1 second, **When** they return to the document, **Then** the resized dimensions are preserved (the save was not lost due to navigation timing).

---

### User Story 2 - Image Move Persists After Navigation (Priority: P1)

A user pastes an image and drags it to a new position on the page. After navigating away and returning, the image should remain at the moved position -- not snapped back to the original paste location.

**Why this priority**: Same root cause as resize persistence. Moving an image and losing that change is equally frustrating.

**Independent Test**: Can be tested by pasting an image, dragging it to a different position, navigating away, and returning to verify it stayed at the new position.

**Acceptance Scenarios**:

1. **Given** a user has pasted an image and dragged it to a new position, **When** they navigate to the dashboard and return, **Then** the image appears at the dragged position (correct x, y coordinates).
2. **Given** a user moves an image and immediately navigates away, **When** they return to the document, **Then** the moved position is preserved.

---

### User Story 3 - Multiple Resize/Move Operations Persist (Priority: P2)

A user performs several resize and move operations on one or more images in sequence (e.g., resize, then move, then resize again). All changes should be saved and reflected when the document is reloaded.

**Why this priority**: Once single operations persist correctly, users will naturally perform multiple operations in succession. This is important but follows logically from P1 fixes.

**Independent Test**: Can be tested by performing a series of resize and move operations on an image, navigating away, and verifying the final state is preserved.

**Acceptance Scenarios**:

1. **Given** a user resizes an image, then moves it, then resizes it again, **When** they navigate away and return, **Then** the image shows the final size and position from the last operation.
2. **Given** a user resizes two different images on the same page, **When** they navigate away and return, **Then** both images show their resized dimensions.

---

### Edge Cases

- What happens when a user resizes an image and the app loses network connectivity before saving? The system should retry the save when connectivity returns, or clearly indicate the save failed.
- What happens when a user resizes an image and immediately closes the browser tab (not in-app navigation)? The system should attempt to flush pending changes before unload.
- What happens when a user rapidly resizes an image (dragging the handle back and forth)? Only the final size should be saved, not intermediate states.
- What happens when a user undoes a resize after it has been saved? The undo should revert to the previous saved state and trigger a new save with the reverted dimensions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST persist image position (x, y) changes to the database when an image is moved.
- **FR-002**: System MUST persist image dimension (width, height) changes to the database when an image is resized.
- **FR-003**: System MUST ensure pending image changes are saved before the user navigates away within the application (client-side navigation).
- **FR-004**: System MUST ensure pending image changes are saved before the browser tab is closed or refreshed.
- **FR-005**: When a document is loaded, images MUST render at their last-saved position and dimensions.
- **FR-006**: Rapid successive resize/move operations MUST coalesce into a single save with the final state (no save per intermediate drag position).
- **FR-007**: Undo/redo of image resize and move operations MUST trigger a save of the reverted state.

### Key Entities

- **Image Object**: A positioned image on a canvas page. Key attributes: unique identifier, position (x, y), dimensions (width, height), image source data, aspect ratio, and creation timestamp. Position and dimensions must be persisted whenever they change.
- **Canvas Page**: Contains a collection of images alongside strokes and text boxes. The page data (including all image positions/dimensions) is saved as a single unit.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Image resize changes survive navigation away from and back to the document 100% of the time, including when navigation happens within 1 second of the resize.
- **SC-002**: Image move changes survive navigation away from and back to the document 100% of the time, including when navigation happens within 1 second of the move.
- **SC-003**: No user-visible data loss for image position or size under normal usage patterns (resize, move, navigate away, return).
- **SC-004**: Save indicator shows "Saved" status before the user can navigate away, confirming the data has been persisted.

## Assumptions

- The bug is caused by a timing issue where pending saves (debounced) are cancelled when the user navigates away before the debounce timer fires, rather than a problem with the save data itself.
- The existing save infrastructure (auto-save with debounce) works correctly for strokes and text -- the issue is specific to the navigation timing, not the image data format.
- The fix should benefit all canvas operations (strokes, text boxes, images) since they share the same save pipeline, but the primary symptom is observed with images.
