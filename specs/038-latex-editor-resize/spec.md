# Feature Specification: Auto-Expanding LaTeX Editor

**Feature Branch**: `038-latex-editor-resize`
**Created**: 2026-04-12
**Status**: Draft
**Input**: User description: "I want to change the view of editing a LaTeX expression, sometimes the expressions are very long and the editor is not comfortable in that case. Expand editor according to text length."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Comfortable Editing of Long LaTeX Expressions (Priority: P1)

A user clicks "Edit" on a math expression and switches to "Edit LaTeX" mode. The existing LaTeX code is long (e.g., a matrix, an aligned multi-step equation, or a fraction nested inside integrals). Currently, the single-line input forces them to scroll horizontally through a narrow field to find the part they want to change. Instead, the editor input should automatically grow taller to reveal the full expression, so the user can see and edit the entire LaTeX code at a glance.

**Why this priority**: This is the core pain point. Long LaTeX in a single-line input is the primary usability problem. Solving this alone delivers most of the value.

**Independent Test**: Can be fully tested by editing an existing math expression with 100+ characters of LaTeX and verifying the input area expands to show the full text without horizontal scrolling.

**Acceptance Scenarios**:

1. **Given** a math expression with a short LaTeX string (e.g., `x^2 + y^2`), **When** the user opens the edit panel, **Then** the editor input is a single row — compact and unobtrusive, same as today.
2. **Given** a math expression with a long LaTeX string (e.g., 150+ characters), **When** the user opens the edit panel, **Then** the editor input automatically displays multiple rows so the full expression is visible without horizontal scrolling.
3. **Given** the user is editing and types additional content that makes the expression longer, **When** the text exceeds the current visible area, **Then** the editor grows taller in real time to accommodate the new content.
4. **Given** the user deletes part of a long expression making it shorter, **When** the text fits in fewer rows, **Then** the editor shrinks back down to match the content.

---

### User Story 2 - Comfortable Initial Math Input for Long Descriptions (Priority: P2)

A user triggers the quick math input (`:{ `) and wants to type a long, detailed plain-English description of a complex equation. The input box should expand to accommodate longer text rather than forcing horizontal scrolling within a narrow fixed-width field.

**Why this priority**: Less common than editing existing LaTeX, but the same UX problem. Plain-English descriptions of complex math can also be long.

**Independent Test**: Can be tested by triggering the math input and typing a description longer than 400px worth of text, verifying the input grows to show all text.

**Acceptance Scenarios**:

1. **Given** a user triggers the math input, **When** they type a short description, **Then** the input remains compact (single line).
2. **Given** a user triggers the math input, **When** they type a description that exceeds the available width, **Then** the input wraps to a new line and the box grows taller instead of scrolling horizontally.

---

### User Story 3 - Bounded Growth with Scroll for Extreme Expressions (Priority: P3)

A user pastes or types an extremely long LaTeX expression (e.g., 500+ characters, a full page-length equation). The editor should not grow endlessly and push content off-screen. After reaching a reasonable maximum height, it should stop growing and show a vertical scrollbar.

**Why this priority**: Edge case safety — prevents the editor from becoming larger than the viewport for extreme inputs.

**Independent Test**: Can be tested by pasting a very long LaTeX expression (500+ chars) and verifying the editor grows to a maximum size then shows a scrollbar.

**Acceptance Scenarios**:

1. **Given** a math expression with an extremely long LaTeX string, **When** the user opens the edit panel, **Then** the editor grows up to a maximum height and shows a vertical scrollbar for the remaining overflow content.
2. **Given** the editor is at maximum height with a scrollbar, **When** the user deletes enough text to fit below the maximum, **Then** the scrollbar disappears and the editor shrinks to fit the content.

---

### Edge Cases

- What happens when the user pastes a very wide single token (e.g., `\underbrace{x+x+x+...+x}_{n \text{ times}}` all on one semantic "line")? The editor should still wrap at the container boundary.
- What happens on narrow mobile screens? The editor should respect available viewport width and wrap earlier.
- What happens when switching between "Edit Expression" and "Edit LaTeX" modes? The editor should resize to fit whichever content is currently displayed.
- What happens with empty input? The editor should show a single row with the placeholder text.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The LaTeX edit panel (editing existing expressions) MUST use a multi-line text input that automatically adjusts its height based on the content length.
- **FR-002**: The quick math input box (`:{ ` trigger) MUST use a multi-line text input that automatically adjusts its height based on the content length.
- **FR-003**: Both editors MUST start at a single-line height when content is short, preserving the current compact appearance for simple expressions.
- **FR-004**: Both editors MUST grow smoothly (without layout jumps) as the user types or pastes longer content.
- **FR-005**: Both editors MUST shrink back when content is deleted, never leaving excess empty space.
- **FR-006**: Both editors MUST stop growing at a maximum height and display a vertical scrollbar for content that exceeds that maximum.
- **FR-007**: The editor width MUST respect the available viewport space and cause text to wrap rather than overflow horizontally.
- **FR-008**: Switching between "Edit Expression" and "Edit LaTeX" modes MUST re-adjust the editor height to fit the newly loaded content.
- **FR-009**: All existing keyboard shortcuts (Enter to submit, Escape to cancel) MUST continue to work in the multi-line input.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can see 100% of a LaTeX expression up to 200 characters without scrolling, directly in the editor input.
- **SC-002**: The editor input never overflows horizontally — all text wraps within the editor boundary.
- **SC-003**: Short expressions (under 50 characters) display in a single compact row, maintaining the current minimal footprint.
- **SC-004**: The editor resize happens instantly as the user types — no perceptible delay or layout shift.
- **SC-005**: All existing functionality (submit on Enter, cancel on Escape, mode switching, AI conversion, copy) continues to work without regression.

## Assumptions

- The maximum editor height will be set to a reasonable value that works on common screen sizes (a sensible default, not user-configurable).
- Enter will continue to submit the input (not insert a newline), since LaTeX expressions are single-logical-line inputs even when they wrap visually. If multi-line LaTeX entry is desired in the future, that would be a separate feature.
- The visual styling (colors, borders, shadows, dark mode) will remain consistent with the current design — only the input type and sizing behavior change.
