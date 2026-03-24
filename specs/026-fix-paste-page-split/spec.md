# Feature Specification: Fix Paste Content Page Splitting

**Feature Branch**: `026-fix-paste-page-split`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "We have an issue — when using the editor, copying info from another docx doesn't split to pages like our regular editor when writing. This should work also when copying something."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Paste Plain Text That Exceeds One Page (Priority: P1)

A user copies multiple paragraphs of plain text from an external source (e.g., a Word document, a web page, or another text editor) and pastes them into a Typenote document page. If the pasted content exceeds the page height, the system automatically splits the content across as many pages as needed — just like it does when the user types past the bottom of a page.

**Why this priority**: This is the core bug. Users expect paste to behave identically to typing with respect to page boundaries. Without this, pasted content overflows the visible page area with no way to fix it other than manually retyping.

**Independent Test**: Can be fully tested by pasting 3+ paragraphs of text (enough to exceed one page height) into an empty document and verifying that content is distributed across the correct number of pages.

**Acceptance Scenarios**:

1. **Given** a document with one empty page, **When** the user pastes text that fits within a single page, **Then** all text appears on the current page with no overflow and no new pages are created (beyond the standard trailing empty page).
2. **Given** a document with one empty page, **When** the user pastes text that exceeds one page height, **Then** the system creates additional pages and distributes the content so that no page has content extending beyond the page boundary.
3. **Given** a document with one empty page, **When** the user pastes text that would fill approximately 3 pages, **Then** exactly 3 pages contain content (plus a trailing empty page), and content on each page ends before the page boundary.

---

### User Story 2 - Paste Rich/Formatted Content That Exceeds One Page (Priority: P2)

A user copies formatted content (bold, italic, headings, lists, etc.) from a Word document or web page and pastes it into a Typenote page. The system splits content across pages while preserving all formatting.

**Why this priority**: Users frequently copy from Word documents and websites. Formatting preservation during multi-page paste is essential for the editor to feel production-ready.

**Independent Test**: Can be tested by pasting a mix of headings, bold text, bullet lists, and normal paragraphs that exceed one page, then verifying the content is split correctly and formatting is intact on every page.

**Acceptance Scenarios**:

1. **Given** a document with one empty page, **When** the user pastes formatted content (headings, bold, lists) that exceeds one page, **Then** content is split across pages and all formatting is preserved on each page.
2. **Given** a page that already has some content near the bottom, **When** the user pastes additional formatted content at the cursor, **Then** the existing content stays in place, and only the overflow portion moves to subsequent pages with formatting intact.

---

### User Story 3 - Paste Into a Page That Already Has Content (Priority: P2)

A user has a page that is partially filled with content. They paste additional content that, combined with the existing content, exceeds the page height. The system splits the overflow to subsequent pages without disrupting the existing content above the paste point.

**Why this priority**: This is the realistic usage scenario — users rarely paste into empty pages. The system must handle merging pasted content with existing content gracefully.

**Independent Test**: Can be tested by typing content to fill ~60% of a page, placing the cursor at the end, then pasting enough text to exceed the remaining space. Verify the combined content is correctly split.

**Acceptance Scenarios**:

1. **Given** a page with content filling roughly half the page, **When** the user pastes text at the end that exceeds the remaining space, **Then** the overflow content moves to the next page while the content above the paste point remains on the original page.
2. **Given** a page with content and a cursor in the middle of existing text, **When** the user pastes content that causes the total page content to overflow, **Then** content below the paste insertion point (including pasted content) flows to subsequent pages as needed.

---

### Edge Cases

- What happens when the user pastes content that would span 10+ pages? The system must handle large pastes without freezing or crashing, creating all necessary pages.
- What happens when the user pastes a single very long paragraph (no block breaks) that exceeds one page? The system must split within the paragraph at a word boundary, just like it does during typing.
- What happens when the user pastes content into the last page of a multi-page document? New pages should be appended after the current last page.
- What happens when the user pastes content and then immediately uses Ctrl+Z (undo)? The paste and all resulting page splits should be fully reversible in a single undo operation.
- What happens when pasted content contains empty paragraphs? Empty paragraphs should be preserved and contribute to height measurement like any other block.
- What happens when the user pastes content while in a text box (select mode) rather than the flow editor? Text boxes are independent and do not participate in page splitting — paste into text boxes should remain unchanged.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST detect when pasted content causes a page to exceed its height boundary and automatically split the overflow to subsequent pages.
- **FR-002**: The system MUST handle paste-triggered overflow that spans multiple pages, creating as many new pages as necessary (not just one).
- **FR-003**: The system MUST split pasted content at block boundaries (between paragraphs, headings, list items) whenever possible, falling back to word-boundary splits within a single block only when necessary.
- **FR-004**: The system MUST preserve all text formatting (bold, italic, headings, lists, links, math blocks) when splitting pasted content across pages.
- **FR-005**: The system MUST handle paste into pages that already contain content, correctly accounting for existing content height when determining overflow.
- **FR-006**: The system MUST keep the cursor at a logical position after a multi-page paste (end of pasted content on the final target page).
- **FR-007**: The system MUST allow the entire paste-and-split operation to be undone as a single undo action.
- **FR-008**: The system MUST NOT degrade the existing typing-based page-splitting behavior — the fix must augment, not replace, the current overflow detection.
- **FR-009**: The system MUST complete page splitting for a paste of up to 20 pages worth of content without the editor becoming unresponsive.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pasting content that exceeds one page results in correct page splitting 100% of the time — no content extends beyond the visible page boundary on any page.
- **SC-002**: All text formatting from the source content is preserved across page boundaries after paste-triggered splitting.
- **SC-003**: Pasting 10 pages worth of content completes splitting within 2 seconds on a standard device, with no visible UI freeze.
- **SC-004**: Undo (Ctrl+Z) after a paste-and-split operation restores the document to its exact pre-paste state in a single step.
- **SC-005**: Existing typing-based page splitting continues to work identically after this fix — no regressions in the current overflow behavior.

## Assumptions

- The page height boundary (1123px at 96 DPI, A4 size) remains the standard for all page types.
- The trailing empty page convention (always maintaining one empty page at the end) applies after paste-triggered page creation.
- Text box paste behavior is out of scope — only the flow editor (full-page TipTap editor) is affected.
- The existing block-level and word-boundary splitting strategies are sound and should be reused for paste overflow.
