# Feature Specification: Device-Aware Document Editor Layout

**Feature Branch**: `034-device-layout-detection`
**Created**: 2026-04-07
**Status**: Draft
**Input**: GitHub issue #114 — "Document editor shows tablet layout on narrow desktop windows"

## Problem Summary

The document editor currently chooses between two visual layouts based on the browser window's width. As a result, a desktop user who resizes their browser window narrow enough is shown the tablet/iPad layout, which looks broken in that context. The decision should be based on the **type of device a person is using**, not on how wide their window happens to be at the moment.

Each "layout" actually bundles two things together — the **page surface presentation** AND the **device-specific UI chrome** around it — and today both flip on the same viewport-width breakpoint. This fix changes _both_ of them together to be driven by device input type instead.

The two layouts are:

- **Page mode** (desktop) — A Word/Google Docs–like presentation: a centered A4 page floating on a gray background with a soft drop shadow and vertical breathing room, plus a dedicated desktop header bar above the toolbar containing the back/home/sidebar-toggle buttons, the document title as an editable input, the connection indicator, and the manual save button with save status. Intended for users sitting at a desk with a precise pointing device (mouse/trackpad).
- **Full-width mode** (tablet) — An iPad/notebook-app-like presentation: the page fills the entire viewport edge-to-edge on a plain white background with no shadow or padding; the dedicated desktop header bar is hidden, and a compact "back / home / truncated title label" cluster lives inline at the start of the toolbar instead. Intended for users holding a touch device where every pixel of screen space matters and the page should feel like a single continuous surface.

After this fix, a single device-type decision drives _both_ the page surface presentation _and_ the chrome — they always agree, and they're always chosen on what the user is actually using rather than how wide the browser window happens to be.

## Clarifications

### Session 2026-04-07

- Q: Should the fix cover only the three Tailwind `xl:` sites the GitHub issue explicitly lists (page background, padding, shadow), or also the two additional `xl:` sites in the editor that swap the header bar (full title input, sidebar toggle, save button, connection indicator) and the tablet toolbar's compact title cluster? → **A: Fix all five sites together.** The desktop-vs-tablet UI chrome and the page surface presentation are part of the same conceptual decision and must be selected by primary input type, not viewport width. Splitting them would only half-fix the bug — a desktop user with a narrow window would get the correct page background but still lose their editable title bar and save button to the cramped tablet toolbar.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Desktop user with a narrow browser window (Priority: P1)

A user is working on a laptop or desktop computer with a mouse or trackpad. They have several windows open side-by-side and the browser window happens to be narrower than what currently triggers "desktop" layout. They open or already have a document open in the editor.

**Why this priority**: This is the bug being reported. It currently makes the editor look visibly broken for any desktop user who doesn't keep their browser maximized — including the common case of two windows side-by-side, or a small laptop screen.

**Independent Test**: Open a document on a desktop computer with a mouse/trackpad. Resize the browser window through a wide range of widths (very narrow, medium, and wide). Confirm the document stays in page mode (centered page, gray background, shadow, vertical padding) at every width.

**Acceptance Scenarios**:

1. **Given** a desktop user with a mouse or trackpad, **When** they open a document in any browser window width, **Then** the editor displays in page mode (centered page with shadow on gray background AND the desktop header bar with the editable title input, sidebar toggle, connection indicator, and manual save button).
2. **Given** a desktop user already viewing a document in page mode, **When** they resize the browser window from wide to narrow, **Then** both the page surface AND the desktop header bar remain in page mode — neither swaps to the tablet variant.
3. **Given** a desktop user already viewing a document in page mode, **When** they resize the browser window from narrow to wide, **Then** the layout remains page mode (no visible "switch" should happen).
4. **Given** a desktop user with a narrow browser window, **When** they look at the title area, **Then** they see the full editable title input (not the truncated tablet title label).

---

### User Story 2 - Tablet user opens a document (Priority: P2)

A user is on a tablet (iPad, Android tablet) using touch as their primary way to interact. They open a document in the editor.

**Why this priority**: Preserves the existing — and intentionally chosen — touch-friendly experience for tablet users. Without this, the fix could regress tablet usability.

**Independent Test**: Open a document on a tablet (or in a browser dev tools touch-emulation mode that exposes a coarse pointer). Confirm the editor displays in full-width mode (edge-to-edge white background, no shadow, no vertical padding) regardless of orientation or window size.

**Acceptance Scenarios**:

1. **Given** a tablet user whose primary input is touch, **When** they open a document, **Then** the editor displays in full-width mode.
2. **Given** a tablet user in portrait orientation, **When** they rotate to landscape (or vice versa), **Then** the editor remains in full-width mode.

---

### User Story 3 - Touchscreen laptop and tablet-with-keyboard edge cases (Priority: P3)

A user is on a touchscreen laptop (e.g. a Windows laptop with both a trackpad and a touchscreen) — or, conversely, a user has paired an external keyboard and trackpad to their tablet.

**Why this priority**: These hybrid devices are increasingly common. The layout should match each device's _primary_ interaction model, not whichever input was touched last.

**Independent Test**: On a touchscreen laptop, confirm the editor uses page mode. On a tablet with a paired external keyboard but no trackpad, confirm the editor uses full-width mode.

**Acceptance Scenarios**:

1. **Given** a touchscreen laptop where the trackpad/mouse is the primary input, **When** the user opens a document, **Then** the editor displays in page mode.
2. **Given** a tablet with an attached external keyboard (but where touch remains the primary input), **When** the user opens a document, **Then** the editor displays in full-width mode.

---

### Edge Cases

- **Initial page load**: There must be no visible "layout flash" — the user must not see the wrong layout briefly before it switches to the correct one.
- **Detection unavailable**: If the browser cannot report the user's primary input type, the editor must still render in some sensible default rather than failing or showing a broken layout.
- **External mouse plugged into a tablet mid-session**: The layout does not need to react live to a hardware change during a session; choosing the layout based on the state at page load is acceptable.
- **Drawing, typing, and scrolling**: Switching the layout-selection logic must not change how pen drawing, text editing, or scrolling behaves on any device. Those interactions must continue to feel exactly as they do today.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The document editor MUST select its layout — meaning **both** the page surface presentation (background, padding, shadow) **and** the device-specific UI chrome around it (desktop header bar vs. compact tablet title cluster inside the toolbar) — based on the user's primary input type (precise pointing device like mouse/trackpad vs. coarse pointer like touch), not on browser window width.
- **FR-002**: Users on a device whose primary input is a precise pointing device (mouse or trackpad) MUST see the document editor in page mode (page surface AND desktop header bar) at every browser window width.
- **FR-003**: Users on a device whose primary input is touch MUST see the document editor in full-width mode (page surface AND compact tablet title cluster) at every browser window width and orientation.
- **FR-004**: The editor MUST NOT show a visible layout flash on initial page load — users must not briefly see the wrong layout before it corrects itself.
- **FR-005**: If the user's primary input type cannot be determined, the editor MUST fall back to page mode as the default. (Rationale: most users on browsers/environments that cannot report this are on desktops.)
- **FR-006**: Pen drawing, text editing, and scrolling behaviors MUST remain unchanged on every device after this change ships — this work is purely about which of two existing layouts is selected.
- **FR-007**: The editor MUST NOT rely on inspecting the browser's user-agent string to make this decision. (Rationale: user-agent sniffing is fragile and unreliable across the long tail of devices and browsers.)
- **FR-008**: The page surface presentation and the UI chrome MUST always agree — i.e., it must be impossible for the editor to be in a state where the page surface is in page mode while the chrome is in tablet mode, or vice versa. They are driven by the same single decision.

### Key Entities

_Not applicable — this feature is purely a presentation/layout change. No data is created, modified, or stored._

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of desktop/laptop users (mouse/trackpad as primary input) see the page-mode layout, regardless of browser window width — including very narrow windows.
- **SC-002**: 100% of tablet users (touch as primary input) see the full-width layout, in both portrait and landscape, regardless of viewport dimensions or whether an external keyboard is attached.
- **SC-003**: Zero visible layout flash on initial page load — measured by manual inspection across the supported devices and by automated visual/E2E checks where feasible.
- **SC-004**: Zero regressions in pen drawing, text editing, or scrolling — verified by re-running the existing canvas/editor test suite and by manual smoke tests on at least one desktop and one tablet device before merge.
- **SC-005**: The reported reproduction (open a document on a desktop, resize the browser window narrower than ~1280px, observe the layout) no longer reproduces — the layout stays in page mode throughout the resize.

## Assumptions

- "Page mode" and "full-width mode" continue to mean the same two visual presentations the editor already implements today; this feature only changes _which one is chosen_, not the modes themselves.
- The editor does not need to react live when a user plugs in or unplugs an input device during a session. Re-evaluating only on page load is acceptable for a first version.
- Users on hybrid devices (touchscreen laptops, tablets with keyboards) are best served by matching their device's _primary_ interaction model, not by exposing a manual toggle. A manual override could be a follow-up if real users ask for it, but is explicitly out of scope here.
- "Page mode as fallback when detection is unavailable" is the right default because the most likely environments where detection is unavailable are old or unusual desktop browsers, not tablets.

## Out of Scope

- Adding a user-facing setting to manually switch between page mode and full-width mode.
- Redesigning either of the two layouts.
- Changing pen, text-editing, or scroll behavior in either layout.
- Reacting live to input-device changes during a session.
