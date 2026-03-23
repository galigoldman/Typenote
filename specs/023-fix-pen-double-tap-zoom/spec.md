# Feature Specification: Fix Pen Double-Tap Triggering Zoom

**Feature Branch**: `023-fix-pen-double-tap-zoom`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "lets fix a bug, it is making zoom due to double tap even if the tap is pen writing. i think it has worked in the localhost and is not working in the vercel for some reason, maybe it has different tap to zoom"

## Clarifications

### Session 2026-03-23

- Q: What kind of zoom is triggered — app custom zoom or browser native zoom? → A: App's custom double-tap zoom. The pen is correctly recognised; the double-tap handler simply needs to be skipped when pen input is detected.

## Context

This is a continuation of the bug first addressed in spec 021-fix-pen-zoom. Previous fix attempts were reverted:

- PointerEvent pen tracking via `penIsDown` flag — reverted
- CSS `touch-action: manipulation` to disable native browser double-tap zoom — reverted

The root cause is simple: the app's custom double-tap zoom handler is being invoked for pen touches. The pen/stylus is already correctly detected by the existing detection logic. The fix is to ensure pen touches are excluded from the double-tap zoom code path entirely.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Pen Writing Without Accidental Zoom (Priority: P1)

A user writes notes on the canvas using a stylus (e.g., Apple Pencil). When they quickly tap the pen between strokes — or lift and place the pen rapidly — the canvas must not zoom in or out. The pen should only produce ink strokes, never trigger the app's double-tap zoom.

**Why this priority**: This is the core bug. Accidental zoom while writing disrupts the user's flow and makes the app unusable for sustained pen-based note-taking.

**Independent Test**: Double-tap an Apple Pencil on the canvas on the deployed site. Verify that no zoom animation occurs and no zoom indicator appears.

**Acceptance Scenarios**:

1. **Given** the user is on the canvas with a drawing tool active, **When** they double-tap the canvas with the stylus, **Then** no zoom change occurs and no zoom indicator appears.
2. **Given** the user is drawing and lifts then places the pen quickly (within the double-tap time window), **When** the rapid lift-and-place happens, **Then** no zoom is triggered; only the new stroke is started.

---

### User Story 2 - Finger Double-Tap Zoom Still Works (Priority: P2)

When the user double-taps the canvas with their finger (not a pen), the zoom toggle must still work as expected. The fix must not disable finger-based zoom gestures.

**Why this priority**: Finger double-tap zoom is a legitimate interaction. The fix must be surgical — blocking only pen-triggered zoom, not all zoom.

**Independent Test**: Double-tap the canvas with a finger and verify zoom toggles correctly.

**Acceptance Scenarios**:

1. **Given** the user is on the canvas, **When** they double-tap with a finger (not a stylus), **Then** the canvas zooms in/out as expected.
2. **Given** a stylus is connected but not touching the screen, **When** the user double-taps with their finger, **Then** zoom works normally.

---

### Edge Cases

- What happens when the user double-taps with the pen and then immediately double-taps with a finger? The pen double-tap must be ignored; the subsequent finger double-tap should trigger zoom normally.
- What happens when the pen rapidly lifts and touches in the middle of a long stroke (brief disconnect)? This must not be counted as a double-tap.
- What happens in different canvas modes (draw, erase, select, text)? The pen must never trigger zoom in any mode.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST skip the double-tap zoom handler entirely when the touch is detected as pen/stylus input.
- **FR-002**: The system MUST continue to support finger-based double-tap zoom when a stylus is connected but not actively touching the screen.
- **FR-003**: The system MUST reset any double-tap tracking state when a stylus tap is detected, so a pen tap followed by a finger tap does not falsely register as a double-tap.
- **FR-004**: The system MUST not introduce regressions to existing pen interactions (drawing, erasing, selecting).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero accidental zoom events occur when a user performs 50 consecutive pen tap-and-lift actions within the double-tap time window.
- **SC-002**: Finger double-tap zoom works with 100% reliability with a connected stylus.
- **SC-003**: All pen-based interactions (drawing, erasing, selecting) remain fully functional with no behavioral regression.

## Assumptions

- The primary affected platform is iPadOS with Apple Pencil.
- The existing stylus detection logic correctly identifies pen input — no changes needed to detection, only to how the double-tap handler responds to it.
- Previous fix attempts were reverted because they were overly broad (PointerEvent tracking, CSS touch-action changes). This fix should be minimal — simply gating the double-tap handler on pen detection.
