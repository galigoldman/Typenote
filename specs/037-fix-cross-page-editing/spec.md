# Feature Specification: Fix Cross-Page Text Editing Flow

**Feature Branch**: `037-fix-cross-page-editing`
**Created**: 2026-04-11
**Status**: Draft
**Input**: User description: "Fix the text editor's flow so Enter and Backspace at page boundaries behave like a single continuous document — text and cursor move together across pages."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Enter Pushes Text to Next Page (Priority: P1)

A user is typing notes and their text reaches the bottom of a page. They position their cursor at the beginning of the last line of text and press Enter. The last line of text moves to the top of the next page, and the cursor lands at the beginning of that line on the new page — exactly like pressing Enter in Word or Google Docs.

**Why this priority**: This is the core behavior users expect from any text editor. Without it, the editor feels broken — pressing Enter at a page boundary moves the cursor but leaves text behind, which is confusing and disrupts the writing flow.

**Independent Test**: Can be fully tested by typing text that fills a page, pressing Enter at various positions near the bottom, and verifying that both text and cursor move together to the next page.

**Acceptance Scenarios**:

1. **Given** the cursor is at the beginning of the last line of text on a page, **When** the user presses Enter, **Then** the last line moves to the top of the next page and the cursor is at the beginning of that line on the next page.
2. **Given** the cursor is in the middle of the last line of text on a page, **When** the user presses Enter, **Then** the text after the cursor moves to the top of the next page and the cursor is at the beginning of the moved text on the next page.
3. **Given** a page is nearly full and the user presses Enter on the second-to-last line, **When** the new line causes the last line to overflow, **Then** the overflowing line moves to the next page (cascade behavior preserved).
4. **Given** there is no next page, **When** Enter causes text to overflow, **Then** a new page is created, the overflowing text appears at the top, and the cursor follows the text.

---

### User Story 2 - Backspace Merges Line to Previous Page (Priority: P1)

A user has text that spans multiple pages. They position their cursor at the very beginning of the first line on page 2 and press Backspace. The first line of page 2 merges to the end of page 1, and the cursor moves to the join point on page 1 — again, exactly like a single continuous text editor.

**Why this priority**: This is the complement of Enter-to-overflow. Together they make the editor behave like one continuous document. Backspace across page boundaries is equally fundamental to the editing experience.

**Independent Test**: Can be fully tested by having text on two consecutive pages, placing the cursor at the start of a page, pressing Backspace, and verifying the line merges upward with the cursor at the correct position.

**Acceptance Scenarios**:

1. **Given** the cursor is at position 0 of the first line on page 2, **When** the user presses Backspace, **Then** the first line of page 2 appends to the end of the last line on page 1, and the cursor is at the join point on page 1.
2. **Given** the cursor is at position 0 of the first line on page 1 (the very first page), **When** the user presses Backspace, **Then** nothing happens (no page before it to merge into).
3. **Given** merging text back to a previous page causes that page to overflow, **When** the merge completes, **Then** the overflow cascade re-triggers naturally, re-distributing text across pages correctly.

---

### User Story 3 - Continuous Typing Across Pages (Priority: P2)

A user types continuously without stopping. As their text reaches the bottom of a page, new content naturally flows to the next page. The cursor follows the text seamlessly. The user should not notice page boundaries while typing — it should feel like one infinite document.

**Why this priority**: This is the combined result of Stories 1 and 2 working correctly. It validates that the editor feels like a single continuous text box rather than isolated per-page editors.

**Independent Test**: Can be tested by typing paragraphs of text continuously and verifying that text and cursor flow seamlessly across page boundaries without the user needing to manually navigate between pages.

**Acceptance Scenarios**:

1. **Given** the user is typing on the last line of a page, **When** they continue typing and the text overflows the page, **Then** the overflowing text moves to the next page and the cursor follows it.
2. **Given** text has cascaded across 3+ pages, **When** the user edits text on page 1 causing reflow, **Then** all downstream pages reflow correctly and the cursor stays at the user's edit position.

---

### Edge Cases

- What happens when Enter is pressed on an empty page? The cursor should move to the next line on the same page (or create a new page if at the bottom).
- What happens when Backspace merges a large block of text that causes the previous page to overflow? The cascade should redistribute text correctly across subsequent pages.
- What happens when the user rapidly presses Enter multiple times at a page boundary? Each Enter should correctly push text and create new lines without losing content.
- What happens when a page contains both text boxes and drawings/strokes? Only the flow text box content should participate in cross-page flow; drawings stay on their page.
- What happens when Backspace is pressed at the start of a non-flow text box (a user-positioned text box)? Nothing — cross-page flow only applies to the main flow text box.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When Enter creates new content that causes text to exceed the page boundary, the overflowing text MUST move to the next page along with the cursor.
- **FR-002**: When Backspace is pressed at position 0 of the first line of a page's flow text box, the content MUST merge with the previous page's flow text box, and the cursor MUST move to the join point.
- **FR-003**: The cursor MUST always follow the text it belongs to across page boundaries — it must never move to a different page without its associated text, and text must never move without the cursor following.
- **FR-004**: Cross-page text flow MUST only apply to the main flow text box on each page. User-positioned text boxes MUST NOT participate in cross-page flow.
- **FR-005**: When text overflows to a page that does not yet exist, the system MUST automatically create a new page and place the overflow content there.
- **FR-006**: When text is merged back to a previous page via Backspace and the merge causes that page to overflow, the cascade MUST re-trigger to redistribute text correctly.
- **FR-007**: All existing editor functionality (drawing, user-positioned text boxes, PDF backgrounds, undo/redo) MUST continue to work unchanged.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pressing Enter at any position near the bottom of a page moves both text and cursor to the next page in a single action — the user never sees the cursor on a different page than their text.
- **SC-002**: Pressing Backspace at the start of any page (except page 1) merges the first line with the previous page and the cursor lands at the correct join position.
- **SC-003**: Continuous typing across page boundaries feels seamless — the user does not need to manually navigate between pages during normal editing.
- **SC-004**: No content is lost during Enter/Backspace operations at page boundaries, including when cascading across multiple pages.
- **SC-005**: All existing E2E tests continue to pass, confirming no regression in other editor features.

## Clarifications

### Session 2026-04-11

- Q: What exactly should happen when Enter is pressed at the beginning of the last line on a full page? → A: The last line MUST move to the next page (pushed down), cursor follows it. All content after the cursor shifts down by one line across pages. The current implementation fails because overflow detection doesn't fire when the page is already full — content gets clipped instead of cascading.
- Q: What is the canonical E2E test for this feature? → A: Paste 5 pages of text, place cursor at the beginning of the last line on a page, press Enter. Verify: (1) cursor moves to next page, (2) the line moves with it, (3) all subsequent content shifts down by one line.

## Assumptions

- The fix applies only to the main "flow" text box (the `-ftb` text box) on each page, not to user-created positioned text boxes.
- Drawings and strokes are page-anchored and do not participate in cross-page text flow.
- The current page-based canvas architecture is preserved — this is not a rewrite to a single infinite editor, but rather making the existing multi-page system behave like one continuous document for text editing.
- Undo/redo behavior for cross-page operations follows the existing undo model — each page's editor maintains its own undo history.
