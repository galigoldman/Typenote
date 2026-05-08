# Feature Specification: Shape Snap on Hold

**Feature Branch**: `015-shape-snap-circle`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "add feature when drawing a circle/rectangle/triangle (even not perfect at all) and hold the pen make it a perfect shape. it is similar to the straight line feature."

## Clarifications

### Session 2026-03-23

- Q: Does the stroke need to be a closed loop to be recognized as a circle? → A: No — open arcs covering ~270° or more of a circular path snap to a full circle (matching GoodNotes behavior).
- Q: Which shapes are in scope? → A: Circles, rectangles, and triangles. All use the same hold-to-snap interaction (long press at the end of the draw).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Draw and hold to snap a perfect circle (Priority: P1)

A user draws a rough circular shape on the canvas with the pen tool. When they finish drawing and hold the pen still on the canvas (without lifting), the rough shape snaps into a perfect circle after a brief delay. The circle preserves the approximate size, position, and pen style (color, thickness, opacity) of the original stroke.

**Why this priority**: Circles are the most common freehand shape and the hardest to draw perfectly. This delivers the highest user value.

**Independent Test**: Draw any roughly circular shape with the pen or highlighter, hold the pen still at the end for ~400ms, and observe the stroke transform into a perfect circle.

**Acceptance Scenarios**:

1. **Given** the user is in pen or highlighter mode, **When** they draw a roughly circular stroke and hold the pen still for ~400ms at the end, **Then** the stroke snaps into a geometrically perfect circle that matches the approximate size and center of the original stroke.
2. **Given** the stroke has snapped to a circle, **When** the user lifts the pen, **Then** the perfect circle is committed as the final stroke with the same color, thickness, and opacity as the original drawing.
3. **Given** the user draws a rough circle, **When** they lift the pen before the hold delay elapses, **Then** the stroke remains as-is (freehand) with no snapping applied.

---

### User Story 2 - Draw and hold to snap a perfect rectangle (Priority: P1)

A user draws a rough rectangular/square shape on the canvas. When they hold the pen still at the end, the stroke snaps into a perfect rectangle aligned to the bounding box of the original stroke.

**Why this priority**: Rectangles are equally common as circles for diagrams, boxes, and UI sketches.

**Independent Test**: Draw any roughly rectangular shape, hold the pen still for ~400ms, and observe the stroke transform into a perfect rectangle.

**Acceptance Scenarios**:

1. **Given** the user is in pen or highlighter mode, **When** they draw a roughly rectangular stroke and hold the pen still for ~400ms, **Then** the stroke snaps into a perfect rectangle matching the approximate size and position of the original stroke.
2. **Given** a roughly square stroke (aspect ratio close to 1:1), **When** the snap triggers, **Then** the system snaps to a perfect square.
3. **Given** the stroke has snapped to a rectangle, **When** the user lifts the pen, **Then** the rectangle is committed with the same color, thickness, and opacity.

---

### User Story 3 - Draw and hold to snap a perfect triangle (Priority: P2)

A user draws a rough triangular shape on the canvas. When they hold the pen still at the end, the stroke snaps into a perfect triangle with straight edges connecting the three detected corners.

**Why this priority**: Triangles are less common than circles and rectangles in everyday note-taking but important for math, physics, and diagram use cases.

**Independent Test**: Draw any roughly triangular shape, hold the pen still for ~400ms, and observe the stroke transform into a perfect triangle.

**Acceptance Scenarios**:

1. **Given** the user is in pen or highlighter mode, **When** they draw a roughly triangular stroke and hold the pen still for ~400ms, **Then** the stroke snaps into a perfect triangle connecting the three most prominent corner points of the original stroke.
2. **Given** the stroke has snapped to a triangle, **When** the user lifts the pen, **Then** the triangle is committed with the same color, thickness, and opacity.

---

### User Story 4 - Adjust shape size while holding (Priority: P2)

After any shape snaps (circle, rectangle, or triangle), if the user moves the pen without lifting, the shape should resize to follow the pen position — similar to how the straight-line snap lets you adjust the endpoint after snapping.

**Why this priority**: This gives the user fine control over the final shape size after snapping, matching the interaction pattern already established by the straight-line feature.

**Independent Test**: Draw a rough shape, wait for snap, then drag the pen and observe the shape resize.

**Acceptance Scenarios**:

1. **Given** a circle has snapped, **When** the user moves the pen without lifting, **Then** the circle radius adjusts so the edge follows the pen position while the center remains fixed.
2. **Given** a rectangle has snapped, **When** the user moves the pen without lifting, **Then** the rectangle resizes with the opposite corner fixed and the dragged corner following the pen.
3. **Given** a triangle has snapped, **When** the user moves the pen without lifting, **Then** the triangle scales uniformly from its centroid.

---

### Edge Cases

- What happens when the user draws a very small shape (a few pixels)? The stroke remains freehand — minimum size threshold applies.
- What happens when the shape is ambiguous (could be a circle or a rectangle)? The system picks the best match based on geometric scoring. If no shape scores above the confidence threshold, it falls through to straight-line snap or stays freehand.
- What happens when the user draws a shape that looks more like a line? The existing straight-line snap takes priority.
- What happens with Apple Pencil vs. finger? The hold-to-snap behavior only activates for pen/stylus/mouse input, not for finger touches (which are used for scrolling/panning).
- What happens when the user draws an open arc (~270°+ of a circle)? It snaps to a full closed circle.
- What happens when the user draws a very elongated rectangle? It snaps to a rectangle (not a line), as long as the width-to-height ratio doesn't exceed a threshold where it becomes line-like.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST classify a freehand stroke as one of: circle, rectangle, triangle, line, or unrecognized — when the user holds the pen still at the end of the stroke.
- **FR-002**: System MUST snap the stroke to the detected perfect shape when the hold duration threshold (~400ms) is reached.
- **FR-003**: The snapped shape MUST preserve the original stroke's color, thickness, and opacity.
- **FR-004**: Circle detection: the snapped circle MUST approximate the center and radius of the original stroke. Open arcs (~270°+) MUST also be recognized.
- **FR-005**: Rectangle detection: the snapped rectangle MUST approximate the bounding box of the original stroke. Near-square strokes (aspect ratio close to 1:1) MUST snap to a perfect square.
- **FR-006**: Triangle detection: the snapped triangle MUST connect the three most prominent corner points detected in the original stroke.
- **FR-007**: System MUST allow the user to adjust the shape size by moving the pen after snapping (without lifting).
- **FR-008**: If the user lifts the pen before the hold threshold, the stroke MUST remain as freehand (no snapping).
- **FR-009**: Shape snap MUST work in both pen and highlighter drawing modes.
- **FR-010**: Shape classification and straight-line snap MUST be mutually exclusive — the system determines the best match and snaps accordingly.
- **FR-011**: The snapped shape MUST be rendered smoothly in real time (no flicker or delay during the snap transition).
- **FR-012**: Shape detection MUST have a minimum size threshold to avoid snapping tiny accidental marks.
- **FR-013**: When multiple shapes could match, the system MUST pick the highest-confidence match. If no shape exceeds the confidence threshold, no shape snap occurs (straight-line snap or freehand applies).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can draw a rough shape and have it snap to a perfect version within 500ms of holding the pen still.
- **SC-002**: 90% of intentionally drawn circles, rectangles, and triangles are correctly detected and snapped to the right shape type.
- **SC-003**: The snapped shape's center/position is within 10% of the bounding box center of the original stroke.
- **SC-004**: The feature works consistently across pen and highlighter tools with all available colors and sizes.
- **SC-005**: No regression in the existing straight-line snap feature — lines still snap correctly.
- **SC-006**: Shape classification runs in under 1ms, maintaining 60fps rendering during drawing.

## Assumptions

- The hold delay for shape snapping uses the same duration as straight-line snapping (~400ms), maintaining consistency.
- Shape detection is based on geometric properties (curvature, corner detection, aspect ratio), not AI or machine learning.
- Circles, rectangles, and triangles are in scope. Ellipses, pentagons, and other shapes are not included.
- The feature applies only to pen/stylus input, consistent with existing drawing behavior where finger input is reserved for scrolling/panning.
- Shape priority when ambiguous: circle > rectangle > triangle > line (most constrained shape wins).
