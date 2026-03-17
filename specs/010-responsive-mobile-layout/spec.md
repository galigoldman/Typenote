# Feature Specification: Responsive Mobile/Tablet Layout

**Feature Branch**: `010-responsive-mobile-layout`
**Created**: 2026-03-17
**Status**: Draft
**Input**: GitHub Issue #46 — "feat: Responsive mobile/tablet layout — collapsible sidebar". Sidebar is fixed at 250px with no way to collapse. iPad/mobile users lose half their screen. Must look good on mobile phones and iPads, everything collapsible, easy back-navigation, easy UX.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Auto-Collapsing Sidebar on Small Screens (Priority: P1)

A student opens Typenote on their iPhone or Android phone. Instead of seeing the 250px sidebar consuming half the screen, the sidebar is completely hidden. A hamburger menu button is visible in the top-left corner. The student taps it, and the sidebar slides in as a full-height overlay panel. They can browse their folders and courses, tap one to navigate, and the sidebar automatically closes after navigation. The main content area always fills the full viewport width.

**Why this priority**: This is the core problem described in the issue. Without this, mobile users cannot effectively use the app — the sidebar consumes too much screen real estate on small devices.

**Independent Test**: Open the app on a device or browser window narrower than 768px. Verify the sidebar is hidden by default. Verify a hamburger button is visible. Tap the button. Verify the sidebar slides in as an overlay. Tap a course. Verify navigation occurs and the sidebar closes.

**Acceptance Scenarios**:

1. **Given** a user opens the app on a screen narrower than 768px, **When** the page loads, **Then** the sidebar is hidden and a hamburger menu button is visible in the header area.
2. **Given** a user taps the hamburger menu button, **When** the sidebar opens, **Then** it slides in as a full-height overlay panel on top of the content (not pushing the content aside).
3. **Given** the sidebar overlay is open, **When** the user taps a folder or course to navigate, **Then** the app navigates to the selected item and the sidebar automatically closes.
4. **Given** the sidebar overlay is open, **When** the user taps the area outside the sidebar (the dimmed backdrop), **Then** the sidebar closes without navigating anywhere.
5. **Given** a user resizes their browser window from wide (>768px) to narrow (<768px), **When** the breakpoint is crossed, **Then** the sidebar transitions from the inline panel to the overlay behavior seamlessly.

---

### User Story 2 - Swipe Gesture for Sidebar on Touch Devices (Priority: P1)

A student on a tablet or phone swipes right from the left edge of the screen to quickly open the sidebar without needing to find and tap the hamburger button. They can also swipe left on the sidebar to close it. This gesture feels natural and responsive, matching the behavior of native mobile apps.

**Why this priority**: Touch users expect swipe gestures for drawer navigation — it is a fundamental mobile UX pattern. Without it, the experience feels clunky compared to native apps.

**Independent Test**: On a touch device (or touch-emulation in dev tools), swipe right from the left 20px edge of the screen. Verify the sidebar opens. Swipe left on the sidebar. Verify it closes. Verify the gesture does not interfere with scrolling or the canvas drawing tools.

**Acceptance Scenarios**:

1. **Given** a user on a touch device with the sidebar closed, **When** they swipe right starting from the left edge of the screen (within 20px of the left boundary), **Then** the sidebar opens with a smooth sliding animation.
2. **Given** a user on a touch device with the sidebar open, **When** they swipe left on the sidebar panel, **Then** the sidebar closes with a smooth sliding animation.
3. **Given** a user is actively drawing on the canvas or scrolling content, **When** they perform horizontal swipe gestures in the middle of the screen (not from the left edge), **Then** the sidebar does NOT open — the gesture is only triggered from the screen's left edge.
4. **Given** a user on a desktop with a mouse (no touch input), **When** they interact with the app, **Then** the swipe gesture is not active and does not interfere with any interactions.

---

### User Story 3 - Touch-Friendly Tap Targets Throughout the UI (Priority: P1)

A student using their finger on a phone or tablet can easily tap all interactive elements — sidebar navigation items, toolbar buttons, dialog buttons — without accidentally hitting the wrong target. All interactive elements meet the minimum 44px touch target size recommended by Apple's HIG and WCAG 2.5.8.

**Why this priority**: Undersized tap targets are the most common mobile usability issue. If buttons and links are too small to tap reliably, the entire mobile experience feels broken regardless of how good the layout is.

**Independent Test**: On a mobile device, tap each sidebar navigation item, toolbar button, and action button. Verify each can be tapped reliably without accidentally activating adjacent elements. Verify the interactive area for each element is at least 44x44px.

**Acceptance Scenarios**:

1. **Given** a user views the sidebar on a mobile device, **When** they tap on folder or course items, **Then** each item has at least 44px of tappable height and sufficient horizontal padding, so adjacent items are not accidentally triggered.
2. **Given** a user views the canvas editor toolbar on a mobile device, **When** they tap on tool buttons (pen, eraser, highlighter, etc.), **Then** each button has at least 44x44px of tappable area.
3. **Given** a user views any dialog (create document, create course, etc.) on a mobile device, **When** they interact with form fields and action buttons, **Then** all buttons and inputs meet the minimum 44px touch target size.
4. **Given** a user views the sign-out button in the sidebar, **When** they tap it, **Then** the button has adequate touch target size and is easy to tap without accidental activation.

---

### User Story 4 - Full-Width Canvas Editor When Sidebar Hidden (Priority: P1)

When the sidebar is collapsed or hidden (on any screen size), the canvas editor, document editor, and AI chat panel expand to use 100% of the available viewport width. No space is wasted on an invisible sidebar gap. This is especially critical on mobile where every pixel of screen width matters for the drawing canvas.

**Why this priority**: The canvas editor is the primary workspace. If it does not expand to fill the available space when the sidebar is hidden, mobile users have a cramped editing experience.

**Independent Test**: Open a document on a mobile device. Verify the canvas editor fills the entire viewport width. Toggle the sidebar on a desktop. Verify the main content area seamlessly expands and contracts.

**Acceptance Scenarios**:

1. **Given** a user opens a document on a mobile device (sidebar hidden by default), **When** the document loads, **Then** the canvas editor fills the full viewport width with no left-side gap.
2. **Given** a user on a desktop toggles the sidebar closed, **When** the sidebar collapses, **Then** the main content smoothly expands to fill the space previously occupied by the sidebar.
3. **Given** a user on a desktop toggles the sidebar open, **When** the sidebar expands, **Then** the main content smoothly shrinks to accommodate the sidebar without jarring layout shifts.
4. **Given** a user rotates their phone from portrait to landscape, **When** the layout recalculates, **Then** the canvas editor fills the full viewport width appropriate to the new orientation.

---

### User Story 5 - Persistent Collapse State (Priority: P2)

When a user manually collapses or expands the sidebar on desktop, that preference is remembered across page navigations and sessions. A student who prefers a full-width editing experience should not have to re-collapse the sidebar every time they open a new document or refresh the page.

**Why this priority**: Without persistence, the user experience is frustrating — the sidebar springs back to default state on every navigation. However, the app is functional without this (users can just toggle again), making it P2.

**Independent Test**: On desktop, collapse the sidebar. Navigate to another page. Verify the sidebar remains collapsed. Refresh the browser. Verify the sidebar remains collapsed. Expand it. Navigate again. Verify it remains expanded.

**Acceptance Scenarios**:

1. **Given** a user collapses the sidebar on desktop, **When** they navigate to another page within the app, **Then** the sidebar remains collapsed.
2. **Given** a user collapses the sidebar on desktop, **When** they close and reopen the browser tab, **Then** the sidebar loads in its collapsed state.
3. **Given** a user expands a collapsed sidebar, **When** they navigate to another page, **Then** the sidebar remains expanded.
4. **Given** a user on mobile (where sidebar is auto-hidden), **When** the persistence state is checked, **Then** the mobile auto-hide behavior takes precedence over the persisted preference — mobile always starts with the sidebar hidden regardless of the desktop preference.

---

### User Story 6 - Responsive AI Chat Panel (Priority: P2)

A student using the AI chat feature on a mobile phone can access it without the chat panel competing for space with the canvas editor. On small screens, the AI chat panel appears as a bottom sheet or full-screen overlay rather than as a side panel, making it easy to type questions and read responses.

**Why this priority**: The AI chat is a secondary feature compared to the core note-taking experience. Making it usable on mobile is important but secondary to the fundamental layout issues.

**Independent Test**: Open a document linked to a course on a mobile device. Tap the AI chat button. Verify the chat panel opens in a mobile-optimized way (bottom sheet or overlay). Type a question. Verify the input is accessible and the keyboard does not obscure the chat. Dismiss the panel. Verify the canvas editor is fully usable.

**Acceptance Scenarios**:

1. **Given** a user opens a course-linked document on mobile, **When** they tap the AI chat button, **Then** the chat opens as a bottom sheet or full-screen overlay (not a side panel that shrinks the editor).
2. **Given** the AI chat is open on mobile, **When** the user types a question, **Then** the input field is visible above the on-screen keyboard, and the conversation scrolls to show the latest messages.
3. **Given** the AI chat is open on mobile, **When** the user taps a close/dismiss button or swipes down, **Then** the chat panel closes and the canvas editor returns to full screen.
4. **Given** a user is on desktop (wide screen), **When** they interact with the AI chat, **Then** the existing desktop layout is preserved — no changes to the desktop AI experience.

---

### User Story 7 - Easy Back Navigation on Mobile (Priority: P2)

A student deep in a document on mobile can easily navigate back to the course view, the folder view, or the dashboard. Navigation breadcrumbs or a prominent back button are always accessible, and collapsible sections (like course weeks) let users drill down and back up without losing context.

**Why this priority**: On mobile, users cannot see the sidebar's folder tree for navigation context. Without clear back-navigation cues, they feel lost. However, basic browser back already works, making this P2.

**Independent Test**: Navigate to a document within a course on a mobile device. Verify a back button or breadcrumb is visible that takes the user to the course page. From the course page, verify a back button takes the user to the dashboard.

**Acceptance Scenarios**:

1. **Given** a user is viewing a document on mobile, **When** they look at the top of the screen, **Then** a visible back button or breadcrumb link is present showing the parent course name, tapping it navigates back to the course page.
2. **Given** a user is viewing a course page on mobile, **When** they look at the top of the screen, **Then** a back button or breadcrumb is present that navigates back to the main dashboard.
3. **Given** a user is viewing a course page, **When** they see the list of weeks, **Then** each week is a collapsible section they can tap to expand/collapse, showing or hiding documents and materials for that week.
4. **Given** a user on desktop views the same pages, **When** the breadcrumbs or back buttons are rendered, **Then** they are present but styled for desktop (less prominent, since the sidebar provides primary navigation).

---

### Edge Cases

- What happens if a user rotates their device while the sidebar overlay is open? The sidebar should remain open but adapt its dimensions to the new orientation.
- What happens if a user opens a dialog (e.g., create document) while the sidebar overlay is open? The dialog should appear on top of the sidebar; closing the dialog should return to the sidebar state.
- What happens if the user has a very long folder tree that exceeds the sidebar height on mobile? The sidebar content should scroll independently.
- What happens if the user's device supports both touch and mouse (e.g., Surface Pro, iPad with keyboard)? The swipe gesture should work for touch input; mouse interactions should not trigger swipe behavior.
- What happens if a PWA install (future feature) changes the viewport? The responsive breakpoints should work with the PWA's viewport just as with the browser.
- What happens during the transition animation if the user rapidly taps the hamburger button? The animation should complete or reverse cleanly — no stuck/glitched sidebar states.
- What happens if the canvas editor is in drawing mode and the user accidentally swipes from the left edge? The left-edge swipe detection area should be narrow enough (20px) that it rarely conflicts, and drawing mode could optionally suppress the gesture.

## Requirements _(mandatory)_

### Functional Requirements

**Responsive Sidebar Behavior**

- **FR-001**: On screens narrower than 768px, the sidebar MUST be hidden by default and replaced with a hamburger menu button.
- **FR-002**: On screens 768px or wider, the sidebar MUST behave as the current inline panel (visible by default, toggleable).
- **FR-003**: On mobile (<768px), tapping the hamburger menu button MUST open the sidebar as a full-height overlay panel with a dimmed backdrop.
- **FR-004**: On mobile, tapping the backdrop or navigating to a new page MUST close the sidebar overlay.
- **FR-005**: The transition between mobile and desktop layouts MUST happen dynamically when the viewport crosses the 768px breakpoint (e.g., device rotation, browser resize).

**Touch Gestures**

- **FR-006**: On touch devices, swiping right from the left edge of the screen (within 20px) MUST open the sidebar.
- **FR-007**: On touch devices, swiping left on the open sidebar MUST close it.
- **FR-008**: Swipe gestures MUST NOT interfere with canvas drawing, content scrolling, or other touch interactions in the main content area.
- **FR-009**: Swipe gestures MUST only activate on touch input, not mouse input.

**Touch Targets**

- **FR-010**: All interactive elements (buttons, navigation items, links) MUST have a minimum tappable area of 44x44px on touch devices.
- **FR-011**: Sidebar folder/course navigation items MUST have sufficient vertical padding for reliable touch targeting.
- **FR-012**: Canvas editor toolbar buttons MUST have adequate touch target sizes on mobile.

**Layout**

- **FR-013**: When the sidebar is hidden (mobile default or user-toggled), the main content area MUST expand to fill 100% of the viewport width.
- **FR-014**: Layout transitions (sidebar open/close) MUST be animated smoothly (no jarring jumps).
- **FR-015**: The layout MUST work correctly in both portrait and landscape orientations on mobile and tablet devices.

**Persistence**

- **FR-016**: The user's sidebar collapsed/expanded preference on desktop MUST persist across page navigations within the same session.
- **FR-017**: The user's sidebar preference MUST persist across browser sessions (e.g., via local storage).
- **FR-018**: On mobile, the auto-hide behavior MUST take precedence over any persisted desktop preference.

**Navigation**

- **FR-019**: A visible back button or breadcrumb MUST be present on document pages showing the parent course/folder, navigating the user back to the parent view.
- **FR-020**: A visible back button or breadcrumb MUST be present on course pages navigating the user back to the dashboard.
- **FR-021**: Course weeks on the course detail page MUST be collapsible sections (tap to expand/collapse).

**AI Chat Panel (Mobile)**

- **FR-022**: On screens narrower than 768px, the AI chat panel MUST open as a bottom sheet or full-screen overlay instead of an inline side panel.
- **FR-023**: The AI chat overlay on mobile MUST not block or resize the canvas editor when closed.
- **FR-024**: The AI chat on mobile MUST keep the input field visible above the on-screen keyboard.

**Existing Behavior (no changes)**

- **FR-025**: The existing desktop sidebar behavior (toggle open/close, folder tree navigation) MUST remain unchanged for screens 768px and wider.
- **FR-026**: All existing canvas editor functionality (drawing, text, erasing, zoom, etc.) MUST continue to work on all screen sizes.
- **FR-027**: All existing dashboard functionality (create/edit/delete documents, folders, courses) MUST continue to work on all screen sizes.

### Key Entities

- **Sidebar State**: Represents whether the sidebar is open or closed, and whether the current display mode is inline (desktop) or overlay (mobile). Tracks the user's persistent preference separately from the responsive auto-behavior.
- **Viewport Mode**: Derived from the current screen width — "mobile" (<768px) or "desktop" (>=768px). Determines which sidebar behavior (overlay vs. inline) is active.
- **Touch Gesture**: A swipe interaction detected on touch-capable devices, originating from the left edge of the screen. Used to open/close the sidebar without tapping a button.

## Scope Boundaries

**In scope**:

- Responsive sidebar that auto-collapses to overlay on mobile (<768px)
- Hamburger menu button on mobile
- Swipe-to-open/close gesture for touch devices
- Touch target sizing adjustments for all interactive elements
- Full-width content when sidebar is hidden
- Persistent sidebar collapse preference (local storage)
- Mobile-optimized AI chat panel (bottom sheet or overlay)
- Back-navigation breadcrumbs on document and course pages
- Collapsible course week sections
- Smooth animated transitions for all layout changes

**Out of scope (future phases)**:

- Bottom tab navigation bar for mobile (native-app-style tabs)
- Offline support or PWA-specific optimizations
- Gesture-based canvas navigation (pinch-zoom is already implemented)
- Responsive redesign of dashboard card grid (already works with CSS grid/flex)
- Custom mobile-specific toolbar layout for the canvas editor
- Tablet-specific "mini sidebar" (icon-only collapsed sidebar)
- Mobile-specific onboarding or tutorial flows
- Dark mode adjustments specific to mobile

## Assumptions

- The 768px breakpoint is appropriate for distinguishing mobile from desktop. This aligns with Tailwind's `md:` breakpoint and covers all phones in portrait mode while treating tablets in landscape as desktop.
- The shadcn/ui Sheet component (which wraps Radix Dialog) is a suitable foundation for the mobile sidebar overlay, as referenced in the GitHub issue's technical notes.
- Local storage is available and appropriate for persisting sidebar preference. This is a simple key-value preference, not sensitive data.
- The existing `useSidebar` context hook can be extended to support the new responsive behavior without breaking existing consumers.
- Swipe gesture detection can be implemented with the Pointer Events API (already used by the canvas editor) without adding a third-party gesture library.
- The AI chat panel currently renders as an inline element above the canvas editor — changing its mobile presentation to a bottom sheet or overlay does not require backend changes.
- Touch target adjustments can be achieved primarily through CSS (padding, min-height) without restructuring component hierarchies.
- The existing collapsible pattern in the sidebar folder tree (ChevronRight rotation) can be reused for course week collapsibility on the course detail page.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On screens narrower than 768px, the sidebar is hidden by default and the main content fills 100% of the viewport width — verified on at least 3 common phone screen sizes (375px, 390px, 430px).
- **SC-002**: Users can open and close the sidebar on mobile via both the hamburger button and the swipe gesture with zero UI glitches (no stuck states, no layout jumps).
- **SC-003**: All interactive elements in the sidebar, toolbar, and dialogs have a minimum tappable area of 44x44px — verified through visual inspection and measurement on touch devices.
- **SC-004**: The sidebar collapse preference persists across at least 5 consecutive page navigations and at least 1 browser session restart on desktop.
- **SC-005**: On mobile, users can navigate from any document page back to the parent course and from any course page back to the dashboard in 1 tap each — no more than 2 taps to reach the dashboard from any page.
- **SC-006**: The swipe gesture for sidebar open/close does not interfere with canvas drawing or content scrolling — verified by drawing near the left edge of the canvas and scrolling content on mobile.
- **SC-007**: The AI chat panel on mobile opens as an overlay and does not shrink or obstruct the canvas editor when closed — the canvas returns to full viewport width after dismissing the chat.
- **SC-008**: All existing desktop functionality continues to work without regression — sidebar toggle, folder tree navigation, canvas editor tools, document CRUD, and AI chat.
