# Feature Specification: Type Mode Zoom Defaults

**Feature Branch**: `018-type-mode-zoom`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Type mode should feel like Word: always centered, zoomed out by default. Draw mode zoom/scroll stays unchanged."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Word-like Type Mode View (Priority: P1)

When the user switches to Type mode, the page should appear zoomed out (smaller than 100%) and horizontally centered, similar to how Microsoft Word displays a document — the full page width is visible with margins on both sides. When switching to Draw mode, the zoom returns to the current draw-mode behavior (page fills the container width at 100%).

**Why this priority**: This is the core behavioral change — making Type mode feel like a word processor.

**Independent Test**: Switch between Draw and Type modes — Type mode should show the page smaller and centered, Draw mode should fill the width as before.

**Acceptance Scenarios**:

1. **Given** the user is in Draw mode at default zoom, **When** they switch to Type mode, **Then** the page appears zoomed out (smaller) and centered horizontally with visible margins.
2. **Given** the user is in Type mode, **When** they switch to Draw mode, **Then** the page fills the container width at 100% as before.
3. **Given** the user manually zooms in/out while in Type mode, **When** they switch to Draw mode and back to Type, **Then** the zoom resets to the Type mode default (zoomed out).

### Edge Cases

- Zoom level should transition smoothly when switching modes (no jarring jump).
- Draw mode zoom/scroll behavior must remain completely unchanged.
- Mobile/tablet behavior: Type mode default zoom should still be reasonable on small screens.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Type mode MUST display the page at a zoomed-out default (less than 100%), centered horizontally, similar to a word processor view.
- **FR-002**: Draw mode MUST retain its current zoom and scroll behavior (100% default, page fills width).
- **FR-003**: The page MUST always be horizontally centered in Type mode regardless of zoom level.
- **FR-004**: Switching between modes MUST update the zoom level to that mode's default.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In Type mode, the page is visually smaller than the container width with visible side margins.
- **SC-002**: In Draw mode, the page fills the container width as it does today (no regression).
- **SC-003**: Mode switching changes the zoom level without page content loss or layout breaking.

## Assumptions

- A reasonable "zoomed out" default for Type mode is around 75% (the page fills ~75% of the container width), giving a Word-like feel. The exact value may be tuned.
- The existing zoom infrastructure (usePinchZoom, fitScale, zoom state) is reused — no new zoom system needed.
