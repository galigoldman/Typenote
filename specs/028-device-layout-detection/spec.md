# Feature Specification: Device-Based Layout Detection

**Feature Branch**: `028-device-layout-detection`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "Fix document editor layout detection to use device type (touch capability) instead of screen width breakpoint. Currently uses Tailwind xl: (1280px) breakpoint which causes desktop computers with narrow windows to show tablet/iPad layout. Should detect actual device type so tablets/iPads always get tablet view and computers always get desktop/Word-like view regardless of window size."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Desktop User Sees Word-Like Page View (Priority: P1)

A user opens a document on a desktop or laptop computer (Mac, Windows, Linux). Regardless of the browser window size — even if the window is narrow — the editor displays in "page" mode: a centered A4-sized page with a gray background, vertical padding, and a drop shadow, resembling a Word document.

**Why this priority**: This is the core problem. Desktop users with narrow windows currently get an unintended tablet-style layout, which looks broken and inconsistent.

**Independent Test**: Open a document on any desktop browser, resize the window to be narrower than 1280px, and confirm the page/Word-like layout persists.

**Acceptance Scenarios**:

1. **Given** a user is on a desktop computer with a browser window wider than 1280px, **When** they open a document, **Then** the editor displays in page mode (centered page, gray background, shadow).
2. **Given** a user is on a desktop computer with a browser window narrower than 1280px, **When** they open a document, **Then** the editor still displays in page mode (centered page, gray background, shadow).
3. **Given** a user is on a desktop computer, **When** they resize their browser window from wide to narrow, **Then** the layout remains in page mode throughout.

---

### User Story 2 - Tablet/iPad User Sees Full-Width View (Priority: P1)

A user opens a document on a tablet or iPad. The editor displays in full-width mode: white background filling the entire viewport, no page shadow, no vertical padding — the current tablet/mobile experience.

**Why this priority**: Equally critical — tablets must retain their existing optimized touch-friendly layout. The fix must not break the tablet experience.

**Independent Test**: Open a document on an iPad or Android tablet and confirm the full-width layout displays.

**Acceptance Scenarios**:

1. **Given** a user is on an iPad, **When** they open a document, **Then** the editor displays in full-width mode (white background, no shadow, edge-to-edge content).
2. **Given** a user is on an Android tablet, **When** they open a document, **Then** the editor displays in full-width mode.
3. **Given** a user is on a tablet with a keyboard attached (e.g., iPad with Magic Keyboard), **When** they open a document, **Then** the editor still displays in full-width tablet mode (the device is still a tablet).

---

### User Story 3 - Mobile User Sees Full-Width View (Priority: P2)

A user opens a document on a mobile phone. The editor displays in full-width mode, identical to the tablet experience.

**Why this priority**: Mobile should continue working as-is. Lower priority because this is not changing — mobile was already getting the full-width view.

**Independent Test**: Open a document on a mobile phone browser and confirm the full-width layout.

**Acceptance Scenarios**:

1. **Given** a user is on a mobile phone, **When** they open a document, **Then** the editor displays in full-width mode.

---

### Edge Cases

- What happens when a desktop user has a touchscreen laptop? The device should be treated as a desktop (page mode), since the primary input is mouse/keyboard.
- What happens when a tablet user uses an external mouse? The device should remain in tablet mode (full-width), since the device itself is still a tablet.
- What happens on first page load before device detection completes? The layout should not visibly flash or shift between modes.
- What happens if the browser does not support the detection method used? The system should fall back to a reasonable default (page mode for non-touch devices, full-width for touch-only devices).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST detect whether the user's device is a desktop/laptop or a tablet/mobile, independent of screen width.
- **FR-002**: On desktop/laptop devices, the document editor MUST display in page mode (centered page, background contrast, page shadow, vertical padding) regardless of browser window size.
- **FR-003**: On tablet and mobile devices, the document editor MUST display in full-width mode (edge-to-edge content, no page shadow, no vertical padding).
- **FR-004**: The detection MUST classify touchscreen laptops as desktop devices (page mode).
- **FR-005**: The detection MUST classify tablets with attached keyboards or mice as tablet devices (full-width mode).
- **FR-006**: The layout MUST be determined on initial page load without a visible flash or layout shift between modes.
- **FR-007**: If device detection is unavailable or inconclusive, the system MUST fall back gracefully — defaulting to page mode on devices with fine pointer capability, and full-width mode on touch-only devices.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A desktop user with a browser window narrower than 1280px sees the page-mode layout 100% of the time.
- **SC-002**: A tablet/iPad user sees the full-width layout 100% of the time, regardless of screen resolution.
- **SC-003**: No visible layout flash or shift occurs during page load on any device.
- **SC-004**: Existing drawing, text editing, and scrolling behavior is unaffected by the layout detection change.

## Assumptions

- The primary distinguishing characteristic between desktop and tablet devices is pointer precision: desktops have a "fine" primary pointer (mouse/trackpad), while tablets have a "coarse" primary pointer (touch). This is a well-supported browser capability via CSS media queries (`pointer: fine` vs `pointer: coarse`).
- Touchscreen laptops typically report `pointer: fine` as their primary pointer because the trackpad/mouse is the primary input, with touch as secondary. This aligns with the desired behavior (treating them as desktops).
- Mobile phones should be treated identically to tablets for layout purposes.
