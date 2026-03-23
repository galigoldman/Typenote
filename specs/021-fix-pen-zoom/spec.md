# Feature Specification: Fix Pen Touch Triggering Zoom

**Feature Branch**: `021-fix-pen-zoom`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "the zoom is being triggered also by pen touch. it should never ! if it is pen touch, meaning you write something - and the pen is recognised good, then dont zoom !!"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Pen Drawing Without Accidental Zoom (Priority: P1)

A user writes or draws on the canvas using a stylus (e.g., Apple Pencil). When they tap the pen down quickly between strokes — or when they lift and place the pen again rapidly — the canvas must not zoom in or out. The pen input should only ever produce ink strokes, eraser actions, or selection interactions, never zoom or pan gestures.

**Why this priority**: This is the core bug. Accidental zoom while writing disrupts the user's flow and makes the app unusable for sustained note-taking with a pen.

**Independent Test**: Can be tested by tapping an Apple Pencil twice quickly on the canvas and verifying that no zoom animation occurs, while a two-finger double-tap still triggers zoom.

**Acceptance Scenarios**:

1. **Given** the user is on the canvas with a pen tool active, **When** they double-tap the canvas with the stylus, **Then** no zoom change occurs and no zoom indicator appears.
2. **Given** the user is drawing with the stylus and lifts then places the pen quickly, **When** the rapid lift-and-place happens within the double-tap time window (300ms), **Then** no zoom is triggered; only the new stroke is started.
3. **Given** the user has a stylus connected, **When** they perform a single-finger (touch) double-tap, **Then** the normal double-tap zoom behavior works as expected.

---

### User Story 2 - Pen Must Not Trigger Single-Finger Pan (Priority: P2)

When the user moves the pen across the canvas, the viewport must not pan. Panning is a finger-only gesture. The pen should always produce tool-specific output (drawing, erasing, selecting) regardless of the active tool.

**Why this priority**: Accidental panning via pen is less likely than accidental zoom (the stylus check already exists for pan start), but must be verified as part of a comprehensive fix.

**Independent Test**: Can be tested by dragging the stylus across the canvas while zoomed in and verifying the viewport does not scroll/pan — only ink appears.

**Acceptance Scenarios**:

1. **Given** the canvas is zoomed in beyond 100%, **When** the user drags the stylus across the screen, **Then** the viewport does not pan; a drawing stroke is created instead.

---

### Edge Cases

- What happens when a pen and a finger touch the screen simultaneously? The pinch gesture must not activate when one of the touches is a stylus.
- What happens when the user double-taps with the pen and then immediately double-taps with a finger? The pen double-tap must be ignored; the subsequent finger double-tap should trigger zoom normally.
- What happens on devices where the pen does not set `touchType: "stylus"` on the TouchEvent? The system should degrade gracefully — zoom behavior remains unchanged on unsupported devices.
- What happens when the pen rapidly lifts and touches in the middle of a long stroke (brief disconnect)? This must not be counted as a double-tap.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST ignore pen/stylus touches when detecting double-tap zoom gestures. A double-tap with a stylus must never trigger a zoom transition.
- **FR-002**: The system MUST continue to support double-tap zoom with finger touches when a stylus is connected but not actively touching the screen.
- **FR-003**: The system MUST ignore pen/stylus touches for single-finger pan gestures (verify existing guard is complete and correct).
- **FR-004**: The system MUST ignore pen/stylus touches for pinch-to-zoom gestures (verify existing guard is complete and correct).
- **FR-005**: The system MUST detect stylus input using the `touchType` property on Touch objects (iPadOS Apple Pencil reports `touchType === "stylus"`).
- **FR-006**: The system MUST reset the double-tap counter when a stylus tap is detected, so a pen tap followed by a finger tap within the time window does not falsely register as a double-tap.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero accidental zoom events occur when a user performs 50 consecutive pen tap-and-lift actions within the double-tap time window.
- **SC-002**: Finger double-tap zoom continues to work with 100% reliability on touch devices with a connected stylus.
- **SC-003**: All existing pen-based interactions (drawing, erasing, selecting) remain fully functional with no behavioral regression.
- **SC-004**: The fix introduces no perceptible delay to pen stroke initiation — the user experience for starting a new stroke feels identical to before the fix.

## Assumptions

- The primary affected platform is iPadOS with Apple Pencil, where `Touch.touchType === "stylus"` reliably identifies pen input.
- Android stylus devices may use different detection methods; this fix targets the `touchType` approach already used in the codebase and does not extend to other platforms unless they use the same API.
- The existing `hasStylus()` utility function is the correct and sufficient mechanism for detecting stylus touches in this codebase.
- The double-tap time window (300ms) is unchanged by this fix.
