# Feature Specification: UI Redesign

**Feature Branch**: `041-ui-redesign`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "Redesign the entire app UI to match a new polished design mockup"

## Clarifications

### Session 2026-05-08

- Q: Should sidebar folder tree be replaced with icon-only links (matching mockup)? → A: Keep the folder tree as-is, just restyle it. Sidebar remains collapsible (open/close) with the tree inside.
- Constraint: Only restyle existing features. Do not add new buttons or functionality that doesn't already exist. If the mockup shows something we don't have (search bar, FAB, starred toggle, notification bell, Settings/Help pages, user avatar, Key Insight cards, quick action chips), skip it. If we have a button the mockup doesn't show, keep it and match the new style.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sidebar Restyling (Priority: P1)

The existing collapsible sidebar with the folder/course tree is restyled to match the mockup's visual language:

- App logo/title at the top restyled with the new purple branding
- Folder tree and course list retain full existing functionality but get updated colors, spacing, and hover states
- Sign out button restyled to match
- Sidebar background updated to cream/beige tone
- Active navigation items highlighted with purple/primary accent
- Existing open/close and mobile sheet behaviors preserved

**Why this priority**: The sidebar is visible on every page and sets the visual tone of the app.

**Independent Test**: Can be tested by opening the sidebar on the dashboard, expanding folders, and verifying the new styling applies without breaking navigation.

**Acceptance Scenarios**:

1. **Given** a user is on the dashboard, **When** the page loads, **Then** the sidebar shows the folder tree with updated styling (colors, spacing, backgrounds)
2. **Given** a user expands a folder in the sidebar, **When** courses appear, **Then** they are styled with the new color scheme
3. **Given** a user is on a mobile device, **When** they open the sidebar sheet, **Then** existing sheet behavior works with updated styling
4. **Given** a user is on a document page, **When** the sidebar is collapsed, **Then** existing collapse behavior is preserved

---

### User Story 2 - Dashboard Card Restyling (Priority: P1)

The existing dashboard elements (course cards, folder cards, document cards, Moodle sync prompt, create buttons) are restyled:

- **Course cards**: White cards with subtle shadows, rounded corners (~12px), existing GraduationCap icon styled with the course color
- **Document cards**: White cards with a colored top border bar (using the existing course/subject color), existing subject badges and relative timestamps restyled
- **Folder cards**: Updated to match the new card style (white, shadows, rounded corners)
- **Moodle sync prompt**: Restyled as a polished banner card with prominent purple "Install Extension" button
- **Create buttons** (New Document, Course, Folder): Restyled to match the new design language but remain in their existing positions
- **Section headers**: "Courses" and "Documents" section labels restyled with larger, bolder typography

**Why this priority**: The dashboard is the first screen users see — card restyling has the biggest visual impact.

**Independent Test**: Can be tested by logging in and verifying all existing dashboard elements render with updated card styles.

**Acceptance Scenarios**:

1. **Given** the user has courses, **When** the dashboard loads, **Then** course cards appear with white backgrounds, shadows, and rounded corners
2. **Given** the user has documents, **When** the dashboard loads, **Then** document cards show colored top borders based on their course/subject color
3. **Given** the Moodle prompt is visible, **When** the dashboard loads, **Then** it appears as a styled banner card with a purple button
4. **Given** the user clicks any create button, **When** the dialog opens, **Then** existing functionality works unchanged

---

### User Story 3 - Document Editor Restyling (Priority: P2)

The existing document editor page is restyled:

- **Course breadcrumb**: The existing course link badge is restyled as a colored pill (e.g., uppercase course name in a green/primary-tinted pill)
- **Document title**: Rendered in larger purple-tinted text
- **Editor content area**: Updated typography with generous padding, improved line-height
- **Editor toolbar**: Existing toolbar buttons restyled with consistent sizing, spacing, and hover/active states matching the new color scheme

**Why this priority**: The editor is where users spend most time — improved typography and styling enhance readability.

**Independent Test**: Can be tested by opening a document within a course and verifying the restyled breadcrumb, title, and toolbar.

**Acceptance Scenarios**:

1. **Given** a document belongs to a course, **When** the user opens it, **Then** the existing course breadcrumb appears as a styled pill badge
2. **Given** a user opens any document, **When** the editor loads, **Then** the title is styled in large purple text
3. **Given** a user uses the toolbar, **When** they click formatting buttons, **Then** buttons have updated styling with correct active states

---

### User Story 4 - AI Chat Panel Restyling (Priority: P2)

The existing AI chat panel is restyled and rebranded:

- **Header**: Rebranded to "AI Tutor" with a green/teal icon and existing close (X) button
- **Quick / Deep toggle**: Existing flash/pro mode toggle restyled as "Quick" / "Deep" tabs
- **Message styling**: AI messages styled with left alignment on light background with "AI ASSISTANT" label. User messages styled right-aligned with teal/green background and "YOU" label.
- **Input area**: Existing input field restyled with rounded corners, updated placeholder text "Ask anything about your course materials...", and purple send button

**Why this priority**: The AI panel is a key differentiator — rebranding and restyling improves perceived quality.

**Independent Test**: Can be tested by opening the AI panel on a document page and verifying the rebranded header, restyled toggle, and message styling.

**Acceptance Scenarios**:

1. **Given** the AI panel is open, **When** the user views it, **Then** the header shows "AI Tutor" with a green icon
2. **Given** the AI panel is open, **When** the user sees the mode toggle, **Then** it shows "Quick" / "Deep" labels (existing functionality, new labels)
3. **Given** the user sends a message, **When** the response renders, **Then** AI messages are left-aligned and user messages are right-aligned with distinct colors
4. **Given** the AI panel is open, **When** the user views the input, **Then** it has rounded styling and a purple send button

---

### User Story 5 - Color Scheme & Global Polish (Priority: P3)

The overall visual language is updated across the app:

- **Primary color**: Purple (#6C5CE7 or similar) for active states, buttons, and accents
- **Background**: Light warm gray/off-white for the main content area
- **Sidebar background**: Slightly darker cream/beige
- **Cards**: White with subtle shadows and rounded corners (~12px)
- **Typography**: Larger, more spacious headings; body text with good line-height
- **Buttons**: Updated hover and active states with purple accents

**Why this priority**: Visual polish ties everything together but can be applied incrementally after structural restyling.

**Independent Test**: Can be tested by visual inspection across dashboard and editor pages.

**Acceptance Scenarios**:

1. **Given** the app loads, **When** the user views any page, **Then** the purple primary color, card shadows, and rounded corners are consistently applied
2. **Given** the user navigates between pages, **When** styles render, **Then** colors and typography are consistent throughout

---

### Edge Cases

- What happens when the user has no courses or documents? The existing empty state renders with updated styling.
- What happens when a document title is very long? It wraps naturally without breaking layout.
- How does the sidebar behave during page transitions? Existing behavior preserved, no flicker.
- What happens with existing buttons not shown in mockup (e.g., Sign Out)? They remain and are restyled to match the new color scheme.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST preserve the existing sidebar with folder/course tree, restyled with new colors and spacing
- **FR-002**: System MUST highlight active sidebar items with the primary purple color
- **FR-003**: System MUST restyle existing course cards with white backgrounds, shadows, and rounded corners
- **FR-004**: System MUST restyle existing document cards with colored top border bars (using course/subject color)
- **FR-005**: System MUST restyle the Moodle sync prompt as a polished banner card
- **FR-006**: System MUST restyle the existing course breadcrumb on documents as a colored pill badge
- **FR-007**: System MUST render document titles in large, purple-styled text in the editor
- **FR-008**: System MUST rebrand the AI chat panel header as "AI Tutor" with a green/teal icon
- **FR-009**: System MUST restyle the existing flash/pro toggle as "Quick" / "Deep" tabs
- **FR-010**: System MUST style AI messages left-aligned with "AI ASSISTANT" label and user messages right-aligned with "YOU" label
- **FR-011**: System MUST restyle the AI input with rounded corners and purple send button
- **FR-012**: System MUST restyle existing editor toolbar buttons with consistent sizing and the new color scheme
- **FR-013**: System MUST preserve all existing mobile behaviors (sidebar sheet, responsive layouts)
- **FR-014**: System MUST apply updated color scheme globally: purple primary, warm gray backgrounds, white cards with shadows, rounded corners
- **FR-015**: System MUST keep all existing buttons and functionality — no removals, only restyling

### Key Entities

- **Sidebar**: Existing collapsible sidebar with folder/course tree, restyled
- **Dashboard Cards**: Existing course, folder, and document cards with new visual treatment
- **AI Tutor Panel**: Existing AI chat panel, rebranded and restyled
- **Editor**: Existing toolbar and content area with updated typography and colors

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All existing navigation and functionality works identically after restyling — zero functional regressions
- **SC-002**: The dashboard displays courses and documents with the new card styling (shadows, rounded corners, colored borders)
- **SC-003**: The AI panel header shows "AI Tutor" and the mode toggle shows "Quick" / "Deep" labels
- **SC-004**: The color scheme (purple primary, warm gray backgrounds) is consistently applied across all pages
- **SC-005**: All existing tests pass without modification (or with minimal test updates for changed class names/text)
- **SC-006**: Mobile users retain full existing functionality through the sheet-based sidebar
