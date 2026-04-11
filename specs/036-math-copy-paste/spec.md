# Feature Specification: Math Expression Copy & Paste

**Feature Branch**: `036-math-copy-paste`
**Created**: 2026-04-09
**Status**: Draft
**Input**: User description: "Make math expressions selectable with Copy option alongside Edit (GitHub issue #120), and support pasting math expressions from external sources like Microsoft Word so they render as editable math nodes instead of being ignored."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Select and Copy a Math Expression (Priority: P1)

A user has a document with math expressions and wants to reuse one of them. They click or tap a math expression to select it, then use a "Copy" action to place it on their clipboard. They can then paste it elsewhere in the same document (or another document) and get an identical, editable math node.

**Why this priority**: This is the core of issue #120. Users currently have no way to reuse math expressions — they must retype them from scratch, which is error-prone for complex formulas.

**Independent Test**: Can be fully tested by creating a math expression, selecting it, copying, and pasting it into another location — the pasted result should be an editable math node with the same LaTeX and original text.

**Acceptance Scenarios**:

1. **Given** a document with a rendered math expression, **When** the user clicks/taps the math expression, **Then** it becomes visually selected (highlighted) and an action menu appears with both "Edit" and "Copy" options
2. **Given** a selected math expression with the action menu visible, **When** the user clicks "Copy", **Then** the expression is placed on the clipboard (as both a math-node-aware HTML fragment and a plain-text LaTeX fallback)
3. **Given** a copied math expression on the clipboard, **When** the user pastes inside the same or a different Typenote document, **Then** an editable math node is inserted with the same LaTeX content and original text preserved
4. **Given** a copied math expression on the clipboard, **When** the user pastes into an external application (e.g., a plain text editor), **Then** the LaTeX source code is pasted as plain text (e.g., `\frac{1}{2}`)

---

### User Story 2 - Paste Math Expressions from External Sources (Priority: P2)

A user has a Word document (or web page, Google Docs, etc.) containing math expressions rendered via MathML or similar format. They copy a block of text that includes math, then paste it into Typenote. The text arrives with formatting preserved, and the math expressions are converted into editable math nodes rather than being silently dropped or pasted as garbled text.

**Why this priority**: This unlocks a major workflow — students and professionals often have existing documents with math content in Word/web and want to bring them into Typenote without losing the math. Without this, users must manually re-enter every formula.

**Independent Test**: Can be tested by copying text with math from a Word document and pasting into Typenote — math expressions should appear as rendered, editable math nodes.

**Acceptance Scenarios**:

1. **Given** a Word document containing inline math expressions (MathML/OMML format), **When** the user copies a paragraph with math and pastes into Typenote, **Then** the text is inserted with formatting and the math expressions appear as rendered, editable math nodes
2. **Given** a web page with MathML or KaTeX/MathJax-rendered math, **When** the user copies text containing math and pastes into Typenote, **Then** the math expressions are detected and inserted as editable math nodes
3. **Given** pasted content containing LaTeX strings (e.g., `$\frac{1}{2}$` or `\(\frac{1}{2}\)`), **When** pasted into Typenote, **Then** the LaTeX strings are recognized and converted into rendered math nodes
4. **Given** a paste that contains both regular text and math expressions, **When** pasted into Typenote, **Then** the regular text is inserted normally and only the math portions become math nodes — no content is lost

---

### User Story 3 - Improved Cursor and Interaction Feedback (Priority: P3)

When a user hovers over a math expression, the cursor should indicate that the expression is selectable content, not a clickable link. The interaction model should feel consistent with how other selectable content in the editor behaves.

**Why this priority**: This is a polish/UX improvement that supports the above stories. The current hand cursor misleads users into thinking math expressions are links rather than selectable content.

**Independent Test**: Can be tested by hovering over a math expression and verifying the cursor style, then clicking to verify the selection behavior.

**Acceptance Scenarios**:

1. **Given** the editor is in text/selection mode, **When** the user hovers over a math expression, **Then** the cursor shows a text-selection cursor (not a hand/pointer cursor)
2. **Given** the user clicks a math expression, **When** the expression becomes selected, **Then** it is visually highlighted to indicate selection (consistent with how other content is selected)
3. **Given** the user selects a range of text that includes a math expression, **When** the selection spans across the math node, **Then** the math expression is included in the selection as a whole unit (atomic selection)

---

### Edge Cases

- What happens when pasted math from Word uses an unsupported or proprietary format that cannot be parsed? The system falls back to inserting the raw text representation rather than dropping the content silently.
- What happens when a user copies multiple math expressions at once (e.g., a paragraph with 3 inline formulas)? All three are preserved through the copy-paste round trip.
- What happens when pasting math into a location at the end of a page that would cause overflow? The existing page-split logic handles this — math nodes split across pages like any other inline content.
- What happens when the user copies a math expression and pastes it into the math edit panel's input field? It pastes as plain LaTeX text, not as a rendered node.
- What happens when pasted LaTeX contains syntax errors? The system still creates a math node but displays it in an error state (allowing the user to edit and fix it).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Math expressions MUST be selectable by clicking or tapping on them, resulting in a visible selection highlight
- **FR-002**: Selected math expressions MUST display an action menu with at least "Edit" and "Copy" options
- **FR-003**: The "Edit" action MUST continue to work exactly as it does today — no regression in existing behavior
- **FR-004**: The "Copy" action MUST place the math expression on the system clipboard in two formats: (a) an HTML fragment that preserves the math node structure for paste within Typenote, and (b) a plain-text LaTeX representation for paste into external applications
- **FR-005**: Pasting a previously copied math expression within Typenote MUST recreate an editable math node with the same LaTeX and original text
- **FR-006**: The editor MUST detect math content in pasted HTML from external sources (MathML from Word, KaTeX/MathJax-rendered HTML from web pages) and convert it into editable math nodes
- **FR-007**: The editor MUST detect LaTeX strings in pasted plain text (delimited by `$...$`, `$$...$$`, `\(...\)`, or `\[...\]`) and convert them into rendered math nodes
- **FR-008**: Pasting content with a mix of regular text and math MUST preserve both — text is inserted as text, math is inserted as math nodes, and no content is silently dropped
- **FR-009**: Math expressions MUST show a text-selection cursor (not a hand/pointer cursor) when hovered in selection mode
- **FR-010**: Selecting a range of text that spans across a math expression MUST include the math node as an atomic unit in the selection
- **FR-011**: When math content from an external source cannot be parsed, the system MUST fall back to inserting the raw text rather than dropping it

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can copy a math expression and paste it into another location within the same document in under 3 seconds (select, copy, navigate, paste)
- **SC-002**: Math expressions pasted from Microsoft Word retain their mathematical meaning — at least 90% of common formulas (fractions, exponents, roots, summations, Greek letters) are recognized and rendered correctly
- **SC-003**: Round-trip fidelity: copying a math expression from Typenote and pasting it back into Typenote produces an identical, editable math node 100% of the time
- **SC-004**: No regression in existing math editing workflow — users can still trigger math input via `:{`, edit expressions by clicking, and see rendered output, all behaving identically to before
- **SC-005**: Pasting LaTeX-delimited text (e.g., `$\frac{1}{2}$`) from a plain text source converts into a rendered math node on first paste without requiring manual conversion
