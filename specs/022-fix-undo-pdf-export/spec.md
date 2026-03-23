# Feature Specification: Fix Undo Content Persisting in PDF Export

**Feature Branch**: `022-fix-undo-pdf-export`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "when making undo, it is still saved somewhere because when i did export to pdf it added the thing that was undo. fix it"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Undone strokes excluded from PDF export (Priority: P1)

A user draws content on the canvas, then undoes some of it. When they export to PDF, only the currently visible content should appear in the exported file. Undone strokes must not be included.

**Why this priority**: This is the core bug. Users expect PDF export to reflect exactly what they see on the canvas. Including undone content breaks trust in the export feature.

**Independent Test**: Draw several strokes, undo one or more, export to PDF, and verify the PDF contains only the strokes visible on canvas.

**Acceptance Scenarios**:

1. **Given** a canvas with 3 strokes where the user has undone the last stroke, **When** the user exports to PDF, **Then** the PDF contains only the 2 visible strokes
2. **Given** a canvas where the user has undone all strokes, **When** the user exports to PDF, **Then** the PDF contains an empty page (no strokes)
3. **Given** a canvas where the user has undone and then redone a stroke, **When** the user exports to PDF, **Then** the PDF contains the redone stroke

---

### User Story 2 - Undone textboxes excluded from PDF export (Priority: P1)

A user adds textboxes to the canvas, then undoes one or more additions. When they export to PDF, only the currently visible textboxes should appear.

**Why this priority**: Same core bug but for textbox elements. Both strokes and textboxes must behave consistently.

**Independent Test**: Add several textboxes, undo the last addition, export to PDF, and verify only visible textboxes appear.

**Acceptance Scenarios**:

1. **Given** a canvas with 2 textboxes where the user has undone the last textbox addition, **When** the user exports to PDF, **Then** the PDF contains only the 1 visible textbox
2. **Given** a canvas with a textbox that was moved and then undone, **When** the user exports to PDF, **Then** the textbox appears at its pre-move position

---

### User Story 3 - Multi-page undo consistency in PDF export (Priority: P2)

A user works across multiple pages, undoes actions on some pages, and exports. Every page in the PDF must accurately reflect its current visible state, not any previously undone content.

**Why this priority**: The bug likely affects all pages, not just the active one. Multi-page consistency is important but secondary to fixing the core single-page case.

**Independent Test**: Create a multi-page document, draw and undo on different pages, export to PDF, and verify each page reflects only visible content.

**Acceptance Scenarios**:

1. **Given** a 3-page document where page 2 has undone strokes, **When** the user exports to PDF, **Then** page 2 in the PDF does not contain the undone strokes
2. **Given** a multi-page document where the user undoes actions on a non-active page, **When** the user exports to PDF, **Then** all pages reflect only their current visible state

---

### Edge Cases

- What happens when the user undoes an action and immediately exports before the auto-save completes?
- What happens when the user undoes all content on a page in a multi-page document?
- What happens when the user undoes, navigates to a different page, then exports?
- What happens when a remote sync occurs between an undo and an export?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The PDF export MUST render only the content currently visible on the canvas at the time of export
- **FR-002**: Undone strokes MUST NOT appear in the exported PDF regardless of whether the undo has been persisted to the database
- **FR-003**: Undone textboxes MUST NOT appear in the exported PDF
- **FR-004**: The PDF export MUST use the current in-memory canvas state as its source of truth, not the database state
- **FR-005**: If a pending save is in-flight when export is triggered, the export MUST still use the current in-memory state, not the last-saved state
- **FR-006**: The fix MUST NOT break the existing undo/redo functionality (undo and redo must continue to work correctly on the canvas)

### Key Entities

- **Canvas Page**: A single page in the document containing strokes and textboxes. The in-memory representation is the source of truth for what the user sees.
- **Stroke**: A drawn path on the canvas, identifiable by a unique ID. Can be added, removed, or restored via undo/redo.
- **Textbox**: A text element on the canvas, identifiable by a unique ID. Can be added, removed, or moved, with undo/redo support.
- **Undo Stack**: In-memory history of actions that can be reversed. Represents the difference between current state and previous states.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of PDF exports reflect exactly the content visible on the canvas at the time of export, with zero undone elements present
- **SC-002**: Exporting immediately after undo produces a correct PDF with no timing-dependent failures
- **SC-003**: Existing undo/redo functionality continues to work correctly with no regressions
- **SC-004**: All undoable element types (strokes, textboxes, moves) are correctly excluded from export when undone

## Assumptions

- The current in-memory canvas state is the correct source of truth for what the user sees on screen
- The bug is caused by a mismatch between what the PDF export reads and what the user sees, likely due to async save/sync timing or the export reading from a stale data source
- The fix should ensure the PDF export always reads from the same state that drives the canvas rendering
