# Feature Specification: Tight Text Selection Bounds

**Feature Branch**: `014-tight-text-bounds`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "I want the text boxes be treated as exactly where the text is (select-wise). Right now the whole line is part of text object even if the text is just on one side."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Precise Text Box Selection (Priority: P1)

A user draws a selection rectangle on the canvas. When the rectangle overlaps only the visible text content of a text box (not the empty space in the text box container), the text box is selected. If the selection rectangle only overlaps empty whitespace within the text box container (to the right of short text, for example), the text box is NOT selected.

**Why this priority**: This is the core behavior change. Currently, text boxes with short text on one side of the container get selected even when the user's selection rectangle only touches empty space far from the actual text. This makes precise selection frustrating, especially on busy canvases with overlapping elements.

**Independent Test**: Can be tested by creating a text box with short left-aligned text, then drawing a selection rectangle that covers only the empty right portion of the container — the text box should NOT be selected.

**Acceptance Scenarios**:

1. **Given** a text box with short left-aligned text (e.g., "hello") in a wide container, **When** the user draws a selection rectangle that covers only the empty right side of the container, **Then** the text box is NOT selected.
2. **Given** a text box with short left-aligned text, **When** the user draws a selection rectangle that overlaps the actual rendered text, **Then** the text box IS selected.
3. **Given** a text box with multi-line text where some lines are shorter than others, **When** the user draws a selection rectangle, **Then** selection is based on the tightest bounding rectangle that encloses all rendered text lines.

---

### User Story 2 - Precise Single-Tap on Text (Priority: P1)

A user taps on the canvas to select a text box. The tap must land on or near the actual rendered text content, not just anywhere within the text box container.

**Why this priority**: Same core issue as rectangle selection — tapping empty whitespace within a text box container should not select it. This is equally important for usability.

**Independent Test**: Can be tested by tapping in the empty space to the right of short text — the text box should not be selected.

**Acceptance Scenarios**:

1. **Given** a text box with short text, **When** the user taps in the empty whitespace area of the container (far from the text), **Then** the text box is NOT selected.
2. **Given** a text box with short text, **When** the user taps directly on the rendered text, **Then** the text box IS selected.

---

### User Story 3 - Selection Visual Feedback Matches Bounds (Priority: P2)

When a text box is selected, the selection highlight/border shown to the user should reflect the tight bounds around the actual text content, not the full container width.

**Why this priority**: Visual consistency — if selection detection uses tight bounds, the visual feedback should match. Without this, users would be confused by a highlight that doesn't match the selectable area.

**Independent Test**: Select a text box with short text and visually verify the selection border wraps tightly around the text content.

**Acceptance Scenarios**:

1. **Given** a selected text box with short text, **When** viewing the selection highlight, **Then** the highlight border wraps around the actual text content area, not the full container width.
2. **Given** a selected text box with multi-line text of varying widths, **When** viewing the selection highlight, **Then** the highlight encompasses the widest rendered line and all text vertically.

---

### Edge Cases

- What happens when a text box is empty (no content)? The text box should remain selectable using a minimum bounding area (a small default clickable region at the text box origin).
- What happens with right-to-left (RTL) text (e.g., Hebrew)? The tight bounds must account for RTL text direction — short RTL text starts from the right side of the container, so the tight bounds should be on the right.
- What happens when the user is in "Type" mode and clicks empty space in a text box to position the cursor? The tight bounds should only affect "Select" mode behavior. In "Type" mode, clicking anywhere in the container should still allow cursor placement.
- What happens when resizing a selected text box by dragging its handles? Resize handles remain at the container bounds (not tight bounds), since resize fundamentally changes the container layout and mixing the two concepts would create confusing text reflow behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST calculate selection bounds for text boxes based on the actual rendered text content dimensions, not the container dimensions.
- **FR-002**: System MUST use the tight text bounds for rectangle-selection hit testing in Select mode.
- **FR-003**: System MUST use the tight text bounds for single-tap hit testing in Select mode.
- **FR-004**: System MUST display the selection highlight/border around the tight text bounds, not the full container.
- **FR-005**: System MUST handle empty text boxes by providing a minimum selectable area at the text box origin point.
- **FR-006**: System MUST correctly calculate tight bounds for RTL text, accounting for text direction.
- **FR-007**: System MUST recalculate tight bounds whenever text content changes (typing, deleting, pasting).
- **FR-008**: System MUST NOT change behavior in Type mode — clicking anywhere in the text box container should still work for cursor placement.
- **FR-009**: System MUST include a small padding around the tight text bounds to ensure text remains comfortably selectable.
- **FR-010**: System MUST keep resize handles at the container bounds (not tight bounds) — tight bounds only affect selection hit-testing and the selection highlight.

### Key Entities

- **Text Box**: Existing canvas element containing rich text. Currently defined by position (x, y) and container dimensions (width, height). Will need an additional concept of "content bounds" representing the tight bounding rectangle of the actual rendered text.
- **Content Bounds**: The measured bounding rectangle of the actually rendered text content within a text box, accounting for text direction, line widths, and vertical extent.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Drawing a selection rectangle over empty whitespace in a text box container (where no text is rendered) does not select the text box.
- **SC-002**: Tapping on empty whitespace in a text box container does not select the text box.
- **SC-003**: All existing selection behavior for text boxes where the selection overlaps actual text content continues to work correctly (no regressions).
- **SC-004**: Selection highlight visually matches the actual text content area, not the full container width.
- **SC-005**: Text boxes with RTL content have correct tight bounds on the right side of the container.

## Clarifications

### Session 2026-03-23

- Q: Should resize handles move to tight bounds or stay at container bounds? → A: Resize handles stay at container bounds; only selection hit-testing and selection highlight use tight bounds.

## Assumptions

- The tight bounds calculation adds a small padding (a few pixels) around the measured text to keep text comfortably selectable — the exact padding value is a UX detail for implementation.
- Height auto-fitting already keeps vertical bounds relatively tight; the primary improvement is horizontal (width) tightening.
- The text box container width (used for text wrapping) remains unchanged — only the selection/hit-testing bounds change.
- Performance impact of measuring actual text content bounds is negligible since bounds only need recalculation when content changes, not on every frame.
