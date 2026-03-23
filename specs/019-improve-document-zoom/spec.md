# Feature Specification: Improve Document Zoom UX

**Feature Branch**: `019-improve-document-zoom`
**Created**: 2026-03-23
**Status**: Draft
**Scope**: iPad only (touch/Apple Pencil interactions)
**Input**: User description: "we need to improve how our document zooming works. it isn't so good right now. we need to make sure pinching specific location goes to this place. we need to support less than 100% screen size. also, when zooming in, it is allowed to move left and right. make it kind of soft to use, try to research best practice for these kind of apps"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Focal-Point Pinch Zoom (Priority: P1)

A user places two fingers on a specific word or diagram on the canvas and pinches outward to zoom in. The content under their fingers stays anchored between their fingers throughout the gesture — the zoom focuses on the exact midpoint of the pinch, not the center of the screen. When they release, the zoomed view is centered on the area they were looking at.

**Why this priority**: This is the core expectation of any touch-based document app. When pinch zoom doesn't anchor to the touch point, users lose their place and the experience feels broken. Apps like GoodNotes, Notability, and Apple Notes all implement focal-point zoom as a baseline.

**Independent Test**: Can be tested by pinching on a known location (e.g., a specific word or drawing) and verifying the content under the pinch point remains stationary throughout the gesture.

**Acceptance Scenarios**:

1. **Given** a document at 100% zoom, **When** the user places two fingers on a specific paragraph and pinches outward, **Then** the paragraph remains visually anchored between the fingers throughout the gesture.
2. **Given** a document at 200% zoom, **When** the user pinches inward on a diagram, **Then** the diagram stays centered between the fingers as the view zooms out.
3. **Given** a document at any zoom level, **When** the user pinches and simultaneously drags (pan-while-zoom), **Then** both zoom and pan update smoothly in unison without jumps or snapping.

---

### User Story 2 - Zoom Below 100% (Zoom-to-Overview) (Priority: P1)

A user wants to see the full page with margins visible around it, or see multiple pages at a glance. They pinch inward past the "fit-to-width" point and the document shrinks, revealing surrounding space. The document remains centered in the viewport with padding around it. The user can zoom out to a comfortable overview level (e.g., 50%) to get a bird's-eye view of their notes.

**Why this priority**: Equally critical to focal-point zoom. The current hard floor at 100% prevents users from getting an overview of their content. Every major note-taking app (GoodNotes, Notability, OneNote, Apple Notes) supports sub-100% zoom for overview navigation.

**Independent Test**: Can be tested by pinching inward past fit-to-width and verifying the document shrinks with centered margins, then zooming back to 100% and verifying normal behavior resumes.

**Acceptance Scenarios**:

1. **Given** a document at 100% (fit-to-width), **When** the user pinches inward, **Then** the document shrinks below full width, centered in the viewport with visible margin/padding on all sides.
2. **Given** a document zoomed out to the minimum level, **When** the user attempts to zoom out further, **Then** the zoom gently resists further reduction (rubber-band effect) and snaps back to the minimum when released.
3. **Given** a document at sub-100% zoom, **When** the user double-taps, **Then** the view animates smoothly back to 100% fit-to-width.

---

### User Story 3 - Smooth Horizontal Panning When Zoomed In (Priority: P2)

When zoomed in beyond fit-to-width, the user can freely pan left and right (and up and down) to navigate the zoomed content. The panning feels natural with momentum — a quick flick continues scrolling and decelerates smoothly, similar to native iOS scrolling behavior.

**Why this priority**: Horizontal panning already partially works via native scroll overflow, but the experience should feel polished and consistent. Momentum scrolling is expected on touch devices and makes navigation efficient.

**Independent Test**: Can be tested by zooming to 200%, then flicking horizontally and verifying smooth momentum-based scrolling that decelerates naturally.

**Acceptance Scenarios**:

1. **Given** a document zoomed to 200%, **When** the user drags horizontally with one finger (in a non-drawing mode), **Then** the view pans smoothly in the drag direction.
2. **Given** a document zoomed in, **When** the user performs a quick flick gesture, **Then** the view continues scrolling with momentum that decelerates to a stop.
3. **Given** a document at 100% or below, **When** the user attempts to pan horizontally, **Then** horizontal panning is disabled (content is already fully visible in width).

---

### User Story 4 - Smooth Animated Transitions (Priority: P2)

All zoom changes that are not direct-manipulation gestures (e.g., double-tap to zoom, zoom reset) animate smoothly between the old and new zoom levels. The animation follows an ease-out curve that feels natural and responsive — snappy at the start, gentle at the end.

**Why this priority**: Animated transitions prevent disorientation. Abrupt zoom jumps (like the current double-tap toggle) lose the user's spatial context. Smooth transitions help users maintain a mental map of where they are in the document.

**Independent Test**: Can be tested by double-tapping and observing a smooth animated zoom transition rather than an instant snap.

**Acceptance Scenarios**:

1. **Given** a document at 100%, **When** the user double-taps, **Then** the view smoothly animates to the zoomed-in level over a brief duration (200-350ms).
2. **Given** a document at 200%, **When** the user double-taps to return to fit, **Then** the view smoothly animates back to 100% with an ease-out curve.
3. **Given** a zoom animation in progress, **When** the user begins a new pinch gesture, **Then** the animation is immediately interrupted and direct-manipulation takes over from the current interpolated state.

---

### User Story 5 - Rubber-Band Overscroll Feedback (Priority: P3)

When the user reaches the edge of the pannable area (while zoomed in) or the zoom limit (min/max), the system provides gentle elastic resistance rather than a hard stop. The content stretches slightly past the boundary and then springs back when released, matching the native iOS feel.

**Why this priority**: Rubber-banding is a polish feature that communicates boundaries without jarring stops. It's a signature UX pattern on iOS/iPadOS that users expect from quality apps.

**Independent Test**: Can be tested by zooming to maximum and continuing to pinch outward — the zoom should slightly exceed the max, then spring back on release.

**Acceptance Scenarios**:

1. **Given** a document zoomed to the maximum level, **When** the user continues pinching outward, **Then** the zoom slightly exceeds the maximum with increasing resistance, and snaps back to the maximum when fingers are released.
2. **Given** a document zoomed to the minimum level, **When** the user continues pinching inward, **Then** the zoom slightly dips below the minimum with resistance, and snaps back to the minimum when released.
3. **Given** a document panned to the left edge while zoomed in, **When** the user continues dragging right, **Then** the content shows a slight elastic overscroll and bounces back when released.

---

### Edge Cases

- What happens when the user rotates the device while zoomed in? The zoom level should be preserved and the view should re-center appropriately.
- What happens when a user is in drawing mode and accidentally triggers a two-finger gesture? Drawing mode must distinguish between intentional pen strokes and zoom/pan gestures (currently handled by touch count detection).
- What happens when the user quickly alternates between pinch and pan? The system should handle rapid gesture switching without visual glitches or state corruption.
- What happens when the user zooms into a region near the edge of a page, close to the boundary with the next page? The viewport should allow seeing content from adjacent pages when zoomed in.
- What happens during a programmatic zoom (e.g., double-tap) while the user is simultaneously touching the screen? The programmatic animation should be cancelled in favor of direct manipulation.
- What happens when content loads or changes while zoomed in (e.g., auto-save indicator, new stroke committed)? The zoom position and level must remain stable.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement focal-point pinch zoom where the content at the midpoint between two touch points remains visually stationary throughout the pinch gesture.
- **FR-002**: System MUST support zoom levels below 100% (fit-to-width), with a minimum zoom of 25%.
- **FR-003**: System MUST center the document in the viewport with visible padding when zoomed below fit-to-width.
- **FR-004**: System MUST allow horizontal panning (left/right) when zoomed beyond fit-to-width, and disable it when at or below fit-to-width.
- **FR-005**: System MUST provide momentum-based scrolling for pan gestures, with natural deceleration matching platform conventions.
- **FR-006**: System MUST animate zoom transitions (double-tap, zoom reset) with an ease-out curve lasting 200-350ms.
- **FR-007**: System MUST allow interruption of animated zoom transitions by direct-manipulation gestures (pinch/pan), resuming from the current interpolated state.
- **FR-008**: System MUST provide rubber-band resistance when the user exceeds zoom boundaries (min/max) or pan boundaries, springing back on release.
- **FR-009**: System MUST support simultaneous zoom and pan during a two-finger pinch gesture (pan-while-zoom).
- **FR-010**: System MUST maintain the current zoom level and approximate viewport position when the device orientation changes.
- **FR-011**: System MUST maintain a maximum zoom level of 400%.
- **FR-012**: System MUST ensure all pointer/touch coordinate transformations remain accurate across all zoom levels (drawing, erasing, text editing, selection).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: When pinch-zooming on a specific point, that point must not visually drift more than 5 pixels from its position between the user's fingers throughout the entire gesture.
- **SC-002**: Zoom transitions (double-tap, reset) complete within 200-350ms with no visible frame drops on target devices (iPad Air 5th gen or equivalent).
- **SC-003**: Users can zoom out to at least 25% of fit-to-width, seeing the full page with surrounding margins.
- **SC-004**: Momentum scroll after a flick gesture travels a distance proportional to flick velocity and decelerates smoothly to a stop within 500-1500ms.
- **SC-005**: Rubber-band overscroll at zoom/pan boundaries is visually perceptible but limited to no more than 10% beyond the boundary.
- **SC-006**: All drawing, erasing, text editing, and selection operations remain pixel-accurate at every supported zoom level (25%-400%).
- **SC-007**: Device orientation changes while zoomed preserve the zoom level and keep the previously-centered content area visible.
