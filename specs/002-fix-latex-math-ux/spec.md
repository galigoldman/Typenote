# Feature Specification: Fix LaTeX Math UX

**Feature Branch**: `002-fix-latex-math-ux`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "Fix LaTeX math input UX issues: auto-save on Enter, cursor placement in math box, remove blue color overlay, add click-to-edit with original language and LaTeX editing options"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Save Math on Enter (Priority: P1)

When a user types a math expression in natural language and presses Enter, the resulting LaTeX should be immediately saved to the document without requiring the user to click away or leave the math node.

**Why this priority**: This is the most critical usability issue. Users expect Enter to confirm and persist their input. Currently, math content is only saved when the user navigates away from the math node, which is unintuitive and risks data loss.

**Independent Test**: Can be fully tested by typing `$`, entering a math expression, pressing Enter, and then refreshing the page to verify the math expression persists.

**Acceptance Scenarios**:

1. **Given** a user has triggered the math input (by typing `$`), **When** the user types a natural language math expression and presses Enter, **Then** the AI conversion is triggered, the LaTeX node is inserted, and the document is saved automatically.
2. **Given** a math expression has been converted and inserted via Enter, **When** the user refreshes the page or navigates away and returns, **Then** the math expression is still present and rendered correctly.
3. **Given** a user is in the math input box, **When** the AI conversion is in progress (loading state), **Then** pressing Enter again has no effect (prevents duplicate submissions).

---

### User Story 2 - Cursor Auto-Focus in Math Input Box (Priority: P1)

After pressing `$` to trigger the math input, the cursor should automatically be placed inside the math input box so the user can immediately start typing without needing to click into it.

**Why this priority**: This directly impacts the typing flow. If the cursor isn't in the math box after pressing `$`, the user must manually click into it, breaking the keyboard-driven workflow and making the feature feel clunky.

**Independent Test**: Can be fully tested by pressing `$` in the editor and immediately typing characters — they should appear in the math input box without any additional clicks.

**Acceptance Scenarios**:

1. **Given** the user is typing in the editor, **When** they press `$`, **Then** the math input box appears and the text cursor is immediately active inside it (the input field has focus).
2. **Given** the math input box has appeared with auto-focus, **When** the user types characters, **Then** the characters appear in the math input box (not in the editor behind it).

---

### User Story 3 - Remove Blue Color Overlay on Rendered LaTeX (Priority: P2)

Rendered LaTeX math expressions should not have a colored background overlay. The current blue/purple background color is visually distracting and not desired.

**Why this priority**: This is a visual polish issue. While it doesn't block functionality, it degrades the reading experience and makes the rendered math look out of place in the document.

**Independent Test**: Can be tested by inserting a math expression and visually confirming it renders with no colored background — the LaTeX should blend naturally with the surrounding text.

**Acceptance Scenarios**:

1. **Given** a LaTeX math expression is rendered in the document, **When** the user views the document, **Then** the math expression has no colored background overlay (no blue, purple, or other highlight color).
2. **Given** a LaTeX math expression is rendered inline with text, **When** the user views it, **Then** the math expression visually blends with surrounding text content (transparent or matching document background).

---

### User Story 4 - Click-to-Edit with Dual Edit Modes (Priority: P2)

When a user clicks on a rendered LaTeX expression, an edit interface should appear offering two editing modes: (1) editing the original natural language text and re-converting via AI, and (2) editing the LaTeX code directly.

**Why this priority**: Editing capability is essential for a complete math input workflow. Users need to fix mistakes or adjust expressions after initial creation. Offering both natural language and direct LaTeX editing accommodates different user skill levels and use cases.

**Independent Test**: Can be tested by clicking on any rendered math expression and verifying the edit interface appears with both editing options functional.

**Acceptance Scenarios**:

1. **Given** a rendered LaTeX expression exists in the document, **When** the user clicks on it, **Then** an edit interface appears with two options: "Edit Expression" (natural language) and "Edit LaTeX" (direct LaTeX code).
2. **Given** the user selects "Edit Expression" (natural language mode), **When** the edit input appears, **Then** it is pre-filled with the original natural language text that was used to generate the LaTeX.
3. **Given** the user is in natural language edit mode, **When** they modify the text and press Enter, **Then** the AI conversion is called with the updated text and the LaTeX expression is replaced with the new result.
4. **Given** the user is in natural language edit mode, **When** they press Enter without changing the original text, **Then** the AI conversion is NOT called (no unnecessary API request), and the edit interface simply closes.
5. **Given** the user selects "Edit LaTeX" (direct LaTeX mode), **When** the edit input appears, **Then** it is pre-filled with the current LaTeX code.
6. **Given** the user is in direct LaTeX edit mode, **When** they modify the LaTeX and press Enter, **Then** the math expression is updated with the new LaTeX (no AI call), and it re-renders immediately.
7. **Given** the user is in either edit mode, **When** they press Escape, **Then** the edit interface closes without making any changes.

### Edge Cases

- What happens when the user clicks on a math expression that was created by directly editing LaTeX (no original natural language stored)? The "Edit Expression" field should be empty, allowing the user to type new natural language.
- What happens when the AI conversion fails during editing? An error message should be displayed in the edit interface, and the original expression should remain unchanged.
- What happens when the user rapidly clicks between different math expressions? The previous edit interface should close before the new one opens.
- What happens when a math expression is edited while another device has the document open (real-time sync)? The edit should be saved and synced normally through the existing sync mechanism.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST save the document immediately after a math expression is inserted via Enter key, without requiring the user to leave the math node.
- **FR-002**: System MUST place the text cursor (focus) inside the math input box immediately when it appears after the user presses `$`.
- **FR-003**: System MUST render LaTeX math expressions without any colored background overlay (no blue, purple, or other highlight).
- **FR-004**: System MUST display an edit interface when a user clicks on a rendered LaTeX expression.
- **FR-005**: The edit interface MUST offer two modes: "Edit Expression" (natural language) and "Edit LaTeX" (direct code editing).
- **FR-006**: In natural language edit mode, the input MUST be pre-filled with the original natural language text used to generate the LaTeX.
- **FR-007**: System MUST store the original natural language text alongside the LaTeX code for each math expression.
- **FR-008**: In natural language edit mode, the system MUST NOT call the AI conversion if the text has not been modified from its original value.
- **FR-009**: In direct LaTeX edit mode, the system MUST update the expression immediately without calling the AI, and re-render using the new LaTeX code.
- **FR-010**: Pressing Escape in any edit mode MUST close the edit interface without making changes.
- **FR-011**: System MUST prevent duplicate AI submissions while a conversion is already in progress (loading state).

### Key Entities

- **MathExpression Node**: Represents a rendered LaTeX math expression in the document. Key attributes: LaTeX code, original natural language text (new attribute), display mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Math expressions are persisted immediately after pressing Enter — verified by page refresh showing the expression still present.
- **SC-002**: After pressing `$`, users can immediately type without additional clicks — the input box receives focus within the same user action.
- **SC-003**: Rendered math expressions have no colored background — visual inspection confirms transparent/matching background.
- **SC-004**: 100% of rendered math expressions are clickable and open the edit interface.
- **SC-005**: When editing in natural language mode without changes, zero AI API calls are made on submit.
- **SC-006**: Users can complete a full edit cycle (click, modify, save) for a math expression in under 5 seconds.

## Assumptions

- The existing auto-save mechanism in the editor can be triggered programmatically after node insertion.
- The MathExpression node schema can be extended to include an `originalText` attribute without requiring a database migration (since content is stored as JSONB).
- KaTeX rendering supports transparent/no-background styling by default when custom styles are removed.
- The floating edit interface can reuse patterns from the existing math input box component.
