# Feature Specification: Reliable Text Reflow and Pagination in Type Mode

**Feature Branch**: `035-fix-text-reflow`
**Created**: 2026-04-07
**Status**: Draft
**Input**: User description: "lets fix this issue" (GitHub issue #118 — "Type mode: text doesn't flow to next line/page automatically like Word/Docs")

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Typing past the bottom of a page flows onto the next page (Priority: P1)

A user is writing a long note in Type mode. They fill the current page and keep typing — without lifting their fingers — and the text that no longer fits flows automatically onto the next page. If they are already on the last page, a new blank page is created for them. They never see an error, never have to press a button, and never run out of writing space.

**Why this priority**: This is the core promise of a page-based document editor — users from Word and Google Docs take this for granted. When it breaks, the user is stuck: they can't just keep writing, and the only workarounds (manually adding a page, reloading the document) destroy their flow. This is the most frequently triggered failure in the bug report.

**Independent Test**: Open a document in Type mode on the last page, place the cursor at the top of the page, hold down a letter key (or paste a multi-paragraph block) until the content exceeds one page, and verify that (a) the overflow moves to a newly created page, (b) the cursor follows the content, and (c) no characters are lost.

**Acceptance Scenarios**:

1. **Given** the user is on the last page of a document with the cursor at the top of an empty page, **When** they type continuously until the content exceeds the page's visible area, **Then** the overflow content is moved onto a new blank page that is created automatically and the cursor moves with the content so they can keep typing.
2. **Given** the user is on a middle page that has a next page already existing, **When** their typing causes content to exceed the current page's visible area, **Then** the overflow content is prepended to the start of the existing next page (no new page is created), and the cursor follows the content onto the next page.
3. **Given** the user's document contains multiple paragraphs on the current page, **When** typing causes overflow, **Then** the split prefers to move whole paragraphs at a time rather than splitting mid-paragraph.
4. **Given** the user is typing quickly (100+ characters per second via paste), **When** the overflow fires, **Then** no typed characters are lost, no visible flicker or flash appears, and the transition between pages is imperceptible.
5. **Given** the current page contains drawings, shapes, or other non-text content, **When** text overflows and is moved to the next page, **Then** the non-text content on both pages is undisturbed.

---

### User Story 2 - Text wraps within a line when the cursor reaches the right edge (Priority: P2)

A user is typing a long sentence. When the cursor reaches the right edge of the page, the next word moves down onto the next line automatically — the same way every text editor has worked for thirty years. Very long words (like URLs or strings of numbers) that don't fit on a single line also wrap at a reasonable point rather than running off the edge of the page.

**Why this priority**: Line wrapping is a baseline expectation — if a single word doesn't wrap, the text is visually clipped and the user loses sight of what they typed. P2 rather than P1 only because the primary complaint in the bug report is page-level flow; line-level wrap issues are likely a narrower subset.

**Independent Test**: Type a single very long paragraph into the document without pressing Enter. Verify that the text wraps at word boundaries at the right edge, and that a 100-character word wraps somewhere rather than extending off the page.

**Acceptance Scenarios**:

1. **Given** the cursor is near the right edge of a line in the middle of a paragraph, **When** the user types the next word, **Then** the word moves down to the start of the next line and remains fully visible on the page.
2. **Given** the user types a word that is wider than a single line (e.g. a long URL with no spaces), **When** they reach the right edge, **Then** the word wraps somewhere before the right edge and remains fully visible.
3. **Given** the user pastes a single very long line of text (no newlines) into the document, **When** the paste completes, **Then** the line wraps visually across multiple lines and, if necessary, across multiple pages.

---

### User Story 3 - Edge cases: pasted content, RTL/LTR mixing, and Enter at the bottom (Priority: P3)

A user pastes a multi-paragraph block from another document, types a mix of Hebrew and English on the same line, or presses Enter at the very bottom of the last page. Each of these works smoothly and produces the same outcome as typing a single character would.

**Why this priority**: These are less frequent than the plain-typing case but are still "table stakes" for a document editor. Users who rely on RTL scripts or paste-heavy workflows can hit these repeatedly once they're in the habit of using Type mode.

**Independent Test**: In a test session, paste a large block of mixed-language text with multiple paragraphs into a full page, then press Enter at the bottom of the last page. Verify the content distributes across the correct number of pages and the cursor ends up in the right place with no lost characters.

**Acceptance Scenarios**:

1. **Given** the user copies a 10-paragraph block from another document, **When** they paste it onto a page that only has room for 2 paragraphs, **Then** the paste splits across multiple pages (creating new pages as needed) and the cursor ends on the page containing the end of the paste.
2. **Given** the user is typing mixed Hebrew and English on the same line, **When** the cursor reaches the edge of the line, **Then** wrap still occurs correctly and the bidirectional text order is preserved.
3. **Given** the user is on the last line of the last page, **When** they press Enter, **Then** a new blank page is created and the cursor jumps to the top of that new page.
4. **Given** a user deletes content after it has been flowed across pages, **When** the source page is no longer full, **Then** the pages remain as they are (pages are NOT pulled back together automatically — this is out of scope, see Assumptions).

---

### Edge Cases

- **Typing faster than the reflow system can react**: the system must not drop keystrokes even when the user is mid-overflow. The character that triggers overflow and any subsequent characters must all land in the correct final position.
- **Undo across a page split**: pressing Undo immediately after a character triggered a page split should restore the page state to before the split, without leaving orphan empty pages behind.
- **A single word wider than the page**: the word should wrap at a visible point rather than extending off the right edge, even if the wrap point is not a natural word boundary.
- **An empty new page created but content does not arrive**: if overflow triggers page creation but the content transfer fails (e.g. due to a timing race), the system must not leave a new blank page behind without content — either the transfer succeeds or the page is not created.
- **IME input / composition**: users typing in Chinese, Japanese, or Korean via an IME must not have their composition interrupted by page flow. Flow should only happen at commit boundaries, not mid-composition.
- **Content that is already overflowing when the document loads**: if a document is opened and one of its pages already has content that overflows (e.g. from an earlier broken save), the document should render correctly (the overflow should be visibly on the page, not clipped silently) — ideally auto-flow on load, but at minimum not crash or hide content.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST wrap text to the next line within a paragraph automatically when the cursor reaches the right edge of the page, for every character the user types.
- **FR-002**: The system MUST detect when content in the current page exceeds the visible page area and move the overflow content to the next page automatically, with no user action required.
- **FR-003**: When the current page is the last page of the document and its content overflows, the system MUST create a new blank page and move the overflow content onto it.
- **FR-004**: When the current page is not the last page and its content overflows, the system MUST prepend the overflow content to the start of the existing next page (without creating a new page).
- **FR-005**: After overflow is flowed onto the next page, the system MUST place the cursor at the end of the moved content (so the user can continue typing uninterrupted).
- **FR-006**: Overflow detection and auto-flow MUST apply to all text input methods: keyboard typing, paste, and IME composition commits.
- **FR-007**: The system MUST NOT lose any typed or pasted characters during a line wrap, page flow, or page creation transition.
- **FR-008**: When splitting a page, the system MUST prefer splitting at whole-block boundaries (paragraphs, headings) over splitting inside a block. When a block must itself be split, the split MUST occur at the nearest word boundary before the page bottom.
- **FR-009**: Non-text page content (drawings, strokes, shapes, highlights, PDF underlays) on both the source and destination pages MUST be unaffected by text reflow.
- **FR-010**: Page flow transitions MUST be visually imperceptible to a typing user — no flash, flicker, jump, or momentary disappearance of content.
- **FR-011**: The failing-to-flow bug scenario described in GitHub issue #118 MUST no longer be reproducible after this fix.

### Out of Scope

- **Backward reflow**: when a user deletes content and a page becomes under-filled, content from later pages is NOT automatically pulled back to fill the gap. (Word and Docs do this; this fix intentionally defers it. Scope-limited to forward overflow only.)
- **Line wrapping at non-word boundaries for languages without word breaks** (Chinese, Japanese, Thai): native browser behavior is acceptable; no custom line-break logic is introduced.
- **Typography-level hyphenation** of long words: the system only needs to ensure long words are _visible_, not that they break at proper hyphenation points.
- **The standalone text editor for imported .docx files** (shown when a document has no page-based content): that editor has no pagination model and is not part of Type mode.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A test that types 2,000 characters of continuous prose into a blank document (starting from an empty last page) completes with 100% of the characters present in the saved document and distributed across the correct number of auto-created pages.
- **SC-002**: In 100 consecutive typing sessions that cross a page boundary, zero characters are lost and zero sessions leave the cursor detached from the visible content.
- **SC-003**: Typing past the bottom of the last page creates exactly one new page (not zero, not two) in 100% of attempts.
- **SC-004**: A user can type at their natural pace for at least 60 seconds across multiple page boundaries without having to press any manual page-control button or observe any visible flicker.
- **SC-005**: The reproduction steps listed in GitHub issue #118 (type a long paragraph, observe wrapping at the right edge, continue to the page bottom, continue past the last page) no longer reproduce the bug — the issue can be closed.
- **SC-006**: On a fresh document with a single page, pasting a 10-paragraph block produces a document with the correct number of pages (no fewer, no extras) and the cursor lands on the page containing the end of the paste.

## Assumptions

- **"Type mode" means the per-page text flow inside the canvas document editor.** It does NOT refer to the standalone text editor used for text-only imported documents (those have no pagination model and are unaffected by this fix).
- **Pages are a fixed A4-like size**. The page dimensions are a constant; this fix does not change them, and reflow is measured against the current constant.
- **Line wrapping within a line is handled by native browser text layout**. This fix does not introduce custom wrap logic; if line wrapping is broken, the cause is expected to be a CSS or container-width regression rather than a missing wrap algorithm.
- **Backward reflow is not required** (see Out of Scope). After a deletion, pages may remain visually under-filled until the user manually adjusts.
- **Drawings, shapes, and PDF underlays on each page live in a separate data structure from the page's text content** and are not touched by text reflow operations.
- **The document's save pipeline is already reliable** — this fix is only about in-memory flow between pages during editing. Persistence of the final multi-page state is assumed to work correctly as soon as the in-memory state is correct.
- **Existing unit test coverage for the split-index calculation is adequate** and can be extended with additional cases rather than rewritten from scratch.
