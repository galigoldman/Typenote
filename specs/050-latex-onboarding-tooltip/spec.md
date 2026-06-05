# Feature Specification: LaTeX Onboarding Tooltip

**Feature Branch**: `050-latex-onboarding-tooltip`
**Created**: 2026-06-04
**Status**: Draft
**Input**: User description: "I want a message for the LaTeX feature. I want a LaTeX Icon on the top toolbar, and when pressing on it you have an explanation on the shortcut :{ that is needed for opening the AI LaTeX conversion. I want this small window to appear at the first use of the user. Have a 'got it' button at the first time. The message should be very short — designed to make the user want to try the feature, maybe with a picture."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - First-Time LaTeX Discovery (Priority: P1)

A new user opens the document editor for the first time. They see a small, visually appealing popover near the LaTeX icon in the toolbar. The popover contains a very short, enticing message (1–2 sentences max) that motivates the user to try the `:{` shortcut — e.g., "Type `:{` to convert text to beautiful math equations instantly." The popover also includes a small illustration or animated preview showing what a LaTeX equation looks like once converted (e.g., a before/after of typed text becoming a rendered equation). A "Got it" button lets the user dismiss it. After clicking "Got it", the popover closes and does not appear automatically again on future visits.

**Why this priority**: This is the core purpose of the feature — ensuring new users discover the LaTeX shortcut without needing external documentation. The message must be short and compelling (not a wall of text) so the user actually reads it and feels motivated to try `:{` immediately.

**Independent Test**: Can be tested by opening the editor as a new user (or clearing the dismissal state) and verifying the popover appears automatically with the correct message and a "Got it" button.

**Acceptance Scenarios**:

1. **Given** a user who has never dismissed the LaTeX onboarding, **When** they open the document editor, **Then** a small popover appears near the LaTeX toolbar icon explaining the `:{` shortcut with a "Got it" button.
2. **Given** the onboarding popover is visible, **When** the user clicks "Got it", **Then** the popover closes and their dismissal is persisted so it does not auto-appear again.
3. **Given** a user who has previously dismissed the onboarding, **When** they open the editor on any subsequent visit, **Then** the popover does NOT appear automatically.

---

### User Story 2 - On-Demand LaTeX Help (Priority: P2)

A returning user (who already dismissed the onboarding) wants to remember the LaTeX shortcut. They click the LaTeX icon in the toolbar, and a popover appears showing the `:{` shortcut explanation. This popover does not have a "Got it" button — it simply closes when the user clicks outside it or clicks the icon again.

**Why this priority**: Even after the first-time experience, users need a way to re-discover the shortcut. The toolbar icon serves as a persistent help reference.

**Independent Test**: Can be tested by dismissing the onboarding first, then clicking the LaTeX icon to verify the help popover appears without the "Got it" button.

**Acceptance Scenarios**:

1. **Given** a user who has dismissed the onboarding, **When** they click the LaTeX icon in the toolbar, **Then** a popover appears with the `:{` shortcut explanation (without a "Got it" button).
2. **Given** the help popover is open, **When** the user clicks outside the popover or clicks the LaTeX icon again, **Then** the popover closes.

---

### Edge Cases

- What happens if the user refreshes the page before clicking "Got it"? The onboarding popover should reappear on the next load since dismissal was not yet persisted.
- What happens on mobile/tablet where the toolbar may be in compact mode? The LaTeX icon and onboarding behavior should still be accessible.
- What if the user has multiple browser tabs open? Dismissal in one tab should be respected when the other tab is refreshed (since persistence uses local storage).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The editor toolbar MUST display a LaTeX icon (e.g., a math/sigma symbol) that is always visible when the toolbar is shown.
- **FR-002**: When a first-time user opens the editor, the system MUST automatically display a popover near the LaTeX icon with a short, enticing message (1–2 sentences max) explaining that typing `:{` triggers AI LaTeX conversion.
- **FR-003**: The first-time popover MUST include a "Got it" dismissal button.
- **FR-008**: The popover MUST include a small visual illustration (static image or inline graphic) showing a before/after example of text being converted into a rendered math equation, so the user immediately understands the value.
- **FR-009**: The popover copy MUST be action-oriented and motivating (e.g., "Type `:{` to turn text into beautiful math"), not a dry technical explanation.
- **FR-004**: After the user clicks "Got it", the system MUST persist the dismissal so the popover does not auto-appear on future editor sessions.
- **FR-005**: The dismissal state MUST be stored locally in the browser so it persists across sessions without requiring server-side storage.
- **FR-006**: After the onboarding has been dismissed, clicking the LaTeX icon MUST open the same explanatory popover, but without the "Got it" button.
- **FR-007**: The on-demand popover MUST close when the user clicks outside it or clicks the LaTeX icon again.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of first-time users see the LaTeX onboarding popover when they open the editor for the first time.
- **SC-002**: After dismissal, the onboarding popover never reappears automatically across subsequent sessions.
- **SC-003**: Users can access the LaTeX shortcut explanation at any time via a single click on the toolbar icon.
- **SC-004**: The LaTeX icon and popover are accessible on both desktop and mobile/tablet layouts.

## Assumptions

- The `:{` shortcut is the established trigger for AI LaTeX conversion and will not change.
- localStorage is the appropriate persistence mechanism — no server-side storage is needed for this UI preference.
- The LaTeX icon should be placed in the "Insert" section of the toolbar (alongside Link, Code block, etc.) since it relates to inserting math content.
- The popover content is a short, static message (not configurable by the user).
- The illustration is a small, static image (e.g., a before/after screenshot or inline SVG) bundled with the app — not fetched from an external service.
- The popover should feel lightweight and fun, not like documentation. Think "feature nudge" not "help article".
