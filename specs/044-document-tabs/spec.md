# Feature Specification: Document Tabs

**Feature Branch**: `044-document-tabs`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "add a tabs view when we are inside a document - similar to google chrome and GoodNotes, each open document will appear as a tab (make a tabs bar at the top/bottom of the page, and each will have a small x so you can close it, moving between tabs will be easy and it won't load for long that way"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View and Switch Between Open Documents (Priority: P1)

A user is working on a document and wants to open a second document without losing their place in the first. They navigate to a second document (via the sidebar or any navigation), and both documents appear as tabs in a tab bar at the top of the editor. The user can click on either tab to instantly switch between documents without a full page reload.

**Why this priority**: This is the core value proposition — users need to work across multiple documents simultaneously without losing context or waiting for pages to reload.

**Independent Test**: Can be fully tested by opening two documents and verifying both appear as tabs, then clicking each tab to confirm the correct document content is displayed instantly.

**Acceptance Scenarios**:

1. **Given** a user has one document open, **When** they navigate to a second document, **Then** both documents appear as separate tabs in the tab bar.
2. **Given** a user has multiple tabs open, **When** they click on a tab, **Then** the corresponding document is displayed immediately without a full page reload.
3. **Given** a user opens a document that is already open in a tab, **When** they navigate to that document again, **Then** the existing tab is focused rather than creating a duplicate.

---

### User Story 2 - Close Document Tabs (Priority: P2)

A user has multiple document tabs open and wants to close one they no longer need. Each tab displays a small close (X) button. Clicking the X closes that tab and removes it from the tab bar. If the closed tab was the active one, the user is automatically switched to an adjacent tab.

**Why this priority**: Closing tabs is essential for managing workspace clutter and is a fundamental tab interaction users expect from Chrome and GoodNotes.

**Independent Test**: Can be fully tested by opening multiple documents as tabs, closing one, and verifying it is removed from the bar and the view switches to another open tab.

**Acceptance Scenarios**:

1. **Given** a user has multiple tabs open, **When** they click the X button on a tab, **Then** that tab is removed from the tab bar.
2. **Given** a user closes the currently active tab, **When** there are other tabs remaining, **Then** the view switches to the nearest adjacent tab (right neighbor first, or left if the rightmost tab was closed).
3. **Given** a user closes the last remaining tab, **When** no tabs are left, **Then** the user is redirected to the dashboard.

---

### User Story 3 - Persist Open Tabs Across Sessions (Priority: P3)

A user has several documents open as tabs. They close their browser or navigate away from the app. When they return later, their previously open tabs are restored, with the same active tab selected.

**Why this priority**: Session persistence prevents frustration from losing workspace context, making the feature feel polished and reliable like a native application.

**Independent Test**: Can be fully tested by opening several documents as tabs, refreshing the page, and verifying the same tabs reappear with the correct active tab selected.

**Acceptance Scenarios**:

1. **Given** a user has multiple tabs open, **When** they refresh the page, **Then** all previously open tabs are restored in the same order.
2. **Given** a user had a specific tab active before leaving, **When** they return, **Then** the same tab is active.

---

### Edge Cases

- What happens when the user opens more documents than can fit in the tab bar width? The tab bar becomes horizontally scrollable so all tabs remain accessible.
- What happens if a document in an open tab is deleted (by the user in another session or from the sidebar)? The tab is removed from the tab bar, and the user is switched to an adjacent tab.
- What happens on mobile/touch devices with limited screen width? Tabs remain usable with touch-friendly sizing and horizontal swipe to scroll.
- What happens if the user has no documents open (fresh session, no persisted tabs)? No tab bar is shown; the user sees the dashboard.
- What happens if the document title is very long? The tab truncates the title with an ellipsis to maintain a usable tab width.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display a tab bar when a user has one or more documents open in the editor view.
- **FR-002**: Each tab MUST display the document title and a close (X) button.
- **FR-003**: System MUST allow users to switch between open documents by clicking or tapping their respective tabs.
- **FR-004**: Switching between tabs MUST NOT require a full page reload — the transition must feel instant to the user.
- **FR-005**: System MUST prevent duplicate tabs — if a document is already open, navigating to it MUST focus the existing tab instead of creating a new one.
- **FR-006**: Clicking the close (X) button on a tab MUST remove that tab from the tab bar.
- **FR-007**: When the active tab is closed, the system MUST automatically switch to an adjacent tab (prefer right neighbor, fall back to left).
- **FR-008**: When the last tab is closed, the system MUST redirect the user to the dashboard.
- **FR-009**: The tab bar MUST handle overflow when many tabs are open, allowing horizontal scrolling to reach all tabs.
- **FR-010**: Open tabs (their order and the active tab) MUST persist across page refreshes and browser sessions within the same device and browser.
- **FR-011**: The currently active tab MUST be visually distinguished from inactive tabs.
- **FR-012**: Tabs with long document titles MUST truncate the text with an ellipsis to maintain usable tab widths.

### Key Entities

- **Open Tab**: Represents a document currently accessible in the tab bar. Key attributes: document reference, display title, position in the tab bar, active/inactive state.
- **Tab Session**: The collection of all open tabs for a user on a given device/browser, including which tab is currently active. Persisted locally on the device.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can switch between open documents in under 0.5 seconds (perceived instant transition).
- **SC-002**: Users can open, switch, and close tabs within 2 clicks or taps per action.
- **SC-003**: 100% of previously open tabs are restored after a page refresh.
- **SC-004**: The tab bar remains fully usable with up to 20 open documents, with all tabs accessible via scrolling.
- **SC-005**: Users spend less time navigating between documents compared to the current single-document flow (no back-and-forth page loads).

## Assumptions

- Tab state (open tabs, order, active tab) is persisted locally on the user's device/browser rather than synced across devices. This keeps the feature simple and avoids database changes.
- The tab bar is positioned at the top of the editor area, consistent with the most common tab UI pattern (Chrome, GoodNotes, VS Code).
- Tab order reflects the order in which documents were opened. Drag-to-reorder is out of scope for this initial version.
- The tab bar is only visible in the document editor view, not on the dashboard or other non-editor pages.
