# Feature Specification: Enable Draw Mode in Text Documents

**Feature Branch**: `025-doc-draw-mode`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "make draw mode work in docs as well, it does not appear"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Draw on Text Documents (Priority: P1)

A user opens a text-only document (e.g., an imported .docx or a document without canvas pages) and wants to annotate it with freehand drawings — just like they can in canvas documents. They tap a draw button in the toolbar, switch to draw mode, and sketch directly over the document content using pen, highlighter, or eraser tools.

**Why this priority**: This is the core ask — without draw mode appearing in text documents, the entire feature is missing. Users currently see no drawing tools when editing text-only docs.

**Independent Test**: Open any text-only document, verify the draw mode toggle appears in the toolbar, activate it, draw strokes on the document, and confirm strokes persist after navigating away and returning.

**Acceptance Scenarios**:

1. **Given** a user opens a text-only document, **When** the document loads, **Then** a draw mode toggle is visible in the toolbar alongside text formatting tools.
2. **Given** a user activates draw mode in a text document, **When** they draw with their finger or stylus, **Then** strokes appear on the document in real time.
3. **Given** a user has drawn strokes on a text document, **When** they save and reopen the document, **Then** all strokes are preserved and rendered correctly.
4. **Given** a user is in draw mode, **When** they switch back to text editing mode, **Then** the strokes remain visible and the text editor becomes active again.

---

### User Story 2 - Use Drawing Sub-Tools in Text Documents (Priority: P1)

A user in draw mode on a text document wants access to the same drawing sub-tools available in canvas documents: pen, highlighter, and eraser — with color and size options.

**Why this priority**: Draw mode without the full set of tools (pen, highlighter, eraser, color/size pickers) would be incomplete and frustrating.

**Independent Test**: Activate draw mode in a text document, switch between pen, highlighter, and eraser, adjust colors and sizes, and verify each tool works correctly.

**Acceptance Scenarios**:

1. **Given** draw mode is active in a text document, **When** the user selects the pen tool, **Then** they can draw opaque strokes with configurable color and size.
2. **Given** draw mode is active, **When** the user selects the highlighter tool, **Then** they can draw semi-transparent highlight strokes with configurable color and size.
3. **Given** draw mode is active, **When** the user selects the eraser tool, **Then** they can erase previously drawn strokes.
4. **Given** the user changes pen color or size, **When** they draw new strokes, **Then** the new strokes reflect the updated settings.

---

### User Story 3 - Seamless Switching Between Text and Draw Modes (Priority: P2)

A user wants to fluidly switch between typing text and drawing annotations without losing work in either mode. The transition should feel natural and not disrupt the editing experience.

**Why this priority**: A clunky mode switch would degrade the user experience and discourage use of the drawing feature.

**Independent Test**: Type text, switch to draw mode, draw strokes, switch back to text mode, continue typing — verify both text and strokes coexist correctly.

**Acceptance Scenarios**:

1. **Given** a user is typing in text mode, **When** they switch to draw mode, **Then** the text content remains visible and unaffected beneath the drawing layer.
2. **Given** a user is drawing in draw mode, **When** they switch to text mode, **Then** the drawing strokes remain visible and the text cursor becomes active.
3. **Given** a user has both text and drawings, **When** they scroll through the document, **Then** drawings stay aligned with the text content they were placed over.

---

### Edge Cases

- What happens when a user draws on a text document and then text content changes (e.g., text is inserted above the drawing)? Drawings should remain anchored relative to the page/viewport position where they were placed.
- What happens when a text document has no prior drawing data? The system should initialize the drawing layer on first draw action.
- What happens when a user erases all drawings? The document should gracefully handle an empty drawing state with no artifacts.
- How does drawing interact with document zoom/pan? Strokes should scale and position correctly at all zoom levels.
- What happens on devices without stylus support? Finger/mouse input should work for drawing, consistent with existing canvas behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display a draw mode toggle in the toolbar when viewing text-only documents.
- **FR-002**: System MUST provide pen, highlighter, and eraser sub-tools in draw mode for text documents, matching the tools available in canvas documents.
- **FR-003**: System MUST allow users to configure color and stroke size for pen and highlighter tools.
- **FR-004**: System MUST render freehand strokes in real time as the user draws on a text document.
- **FR-005**: System MUST persist drawing strokes associated with a text document so they survive page reload and re-opening.
- **FR-006**: System MUST allow users to switch between text editing mode and draw mode without losing content in either mode.
- **FR-007**: System MUST render existing drawings as a visible layer on top of text content, so both are visible simultaneously.
- **FR-008**: System MUST support undo/redo for drawing actions in text documents, consistent with existing canvas undo behavior.
- **FR-009**: Drawings on text documents MUST scale correctly when the document is zoomed in or out.
- **FR-010**: System MUST support the same input methods for drawing in text documents as in canvas documents (stylus, finger, mouse).

### Key Entities

- **Drawing Layer**: An overlay surface on top of text document content where strokes are rendered. Each text document has at most one drawing layer.
- **Stroke**: A single freehand drawing mark with properties: points, color, size, tool type (pen/highlighter/eraser). Same entity used in canvas documents.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can activate draw mode and begin drawing within 1 second of tapping the draw toggle on a text document.
- **SC-002**: 100% of drawing tools (pen, highlighter, eraser) and their settings (color, size) work identically in text documents as they do in canvas documents.
- **SC-003**: Drawn strokes persist across page reloads with zero data loss.
- **SC-004**: Switching between text mode and draw mode completes in under 500ms with no visible content flicker or layout shift.
- **SC-005**: Users with existing text-only documents can annotate them without needing to create a new document or convert document type manually.

## Assumptions

- The existing drawing infrastructure (stroke rendering, tool state, undo/redo) from the canvas editor can be reused for text documents.
- Text documents will gain a drawing layer (overlay) rather than being converted to full canvas documents — the text editing experience remains unchanged.
- Drawing data for text documents will be stored in the same `pages` JSONB structure used by canvas documents, or a compatible format.
- No new drawing tools beyond what exists in the canvas editor are required for this feature.
