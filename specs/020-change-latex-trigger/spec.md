# Feature Specification: Change LaTeX Trigger from $ to :{

**Feature Branch**: `020-change-latex-trigger`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Change the LaTeX math input trigger from the single `$` character to the two-character pair `:{`. Research confirmed `:{` is an available pair that does not conflict with normal typing. A single character cannot be used, so a two-character sequence is required."

## Clarifications

### Session 2026-03-23

- Q: Should the `:` character appear immediately when typed (and be removed if `{` follows), or be buffered until the next keystroke? → A: `:` appears immediately; if `{` follows, both characters are removed and the popup opens (insert-then-cleanup approach).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Open LaTeX Input with :{ (Priority: P1)

A user is writing notes in the editor and wants to insert a math expression. They type `:` immediately followed by `{` (with no characters in between). The LaTeX input popup opens at the cursor position, ready to accept a natural-language math description. Neither the `:` nor the `{` character appears in the document text.

**Why this priority**: This is the core interaction being changed — the primary trigger mechanism for LaTeX input. Without this working, no math can be inserted.

**Independent Test**: Can be fully tested by typing `:{` in the editor and verifying the LaTeX popup appears at the cursor, with no stray characters left in the document.

**Acceptance Scenarios**:

1. **Given** the user is typing in a normal text paragraph, **When** they type `:` immediately followed by `{`, **Then** the `:` that was inserted is removed, `{` is not inserted, and the LaTeX input popup appears at the cursor position.
2. **Given** the user is typing in a normal text paragraph, **When** they type `:{` and then enter a math description and press Enter, **Then** the math expression is rendered inline in the document just as it does today.
3. **Given** the LaTeX popup is open, **When** the user presses Escape, **Then** the popup closes and focus returns to the editor without inserting any characters.

---

### User Story 2 - Normal Use of : and { Characters (Priority: P1)

A user is writing notes that contain colons or curly braces in normal text (e.g., "Note: this is important", code snippets with `{`, JSON examples, emoji shortcodes like `:smile:`). These characters must continue to work normally when they are not typed as the exact `:{` sequence.

**Why this priority**: Equal to P1 because preventing false triggers is just as important as the trigger itself — users type colons frequently and must not have their workflow interrupted.

**Independent Test**: Can be tested by typing various colon-containing text (e.g., "Dear Sir:", "key: value", `:)`, `{ standalone brace }`) and verifying the LaTeX popup never appears.

**Acceptance Scenarios**:

1. **Given** the user is typing in a text paragraph, **When** they type `:` followed by a space or any character other than `{`, **Then** no LaTeX popup appears and the characters are inserted normally.
2. **Given** the user is typing in a text paragraph, **When** they type `{` without a preceding `:`, **Then** no LaTeX popup appears and the `{` is inserted normally.
3. **Given** the user is typing in a text paragraph, **When** they type `:` then pause and later type `{` as part of a different word, **Then** no LaTeX popup appears and both characters are inserted normally.

---

### User Story 3 - No Trigger Inside Code Contexts (Priority: P2)

A user is writing inside a code block or has inline code formatting active. They type `:{` as literal characters (e.g., in a code example showing object syntax). The LaTeX popup must not appear in these contexts.

**Why this priority**: Code blocks and inline code are contexts where `:{` may appear as literal syntax. Suppressing the trigger here prevents disruptive false positives.

**Independent Test**: Can be tested by creating a code block, typing `:{` inside it, and verifying the characters appear as literal text with no popup.

**Acceptance Scenarios**:

1. **Given** the user is typing inside a code block, **When** they type `:{`, **Then** both characters are inserted as literal text and no LaTeX popup appears.
2. **Given** the user has inline code formatting active, **When** they type `:{`, **Then** both characters are inserted as literal text and no LaTeX popup appears.

---

### User Story 4 - Old $ Trigger Removed (Priority: P2)

A user who previously used `$` to open LaTeX input now types `$` in the editor. The `$` character is inserted as a normal text character — no popup appears.

**Why this priority**: Ensures clean migration from the old trigger. Leaving the old trigger active alongside the new one would be confusing.

**Independent Test**: Can be tested by typing `$` in the editor and verifying it appears as a literal dollar sign with no popup.

**Acceptance Scenarios**:

1. **Given** the user is typing in a normal text paragraph, **When** they type `$`, **Then** the `$` character is inserted as normal text and no LaTeX popup appears.

---

### Edge Cases

- What happens when the user types `:{` at the very beginning of an empty document? The popup should still appear.
- What happens when the user types `:{` immediately after a math node? The popup should still appear.
- What happens when the user types `::` followed by `{`? Only the final `:{` pair matters — no popup should appear for `::` and the popup should appear for the `:{` at the end.
- What happens when the user pastes text containing `:{`? Pasting should not trigger the popup — only real-time keystroke sequences should activate it.
- What happens when the user types `:` and then deletes it before typing `{`? No popup should appear.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST open the LaTeX input popup when the user types the exact two-character sequence `:` immediately followed by `{` via keyboard input.
- **FR-002**: When the user types `:`, the character MUST appear immediately in the document. If `{` is typed next, the system MUST remove the `:` from the document, prevent `{` from being inserted, and open the LaTeX popup (insert-then-cleanup). If any other character follows `:`, both characters remain as normal text.
- **FR-003**: The system MUST NOT trigger the LaTeX popup when `:` and `{` are typed with any intervening characters, spaces, or significant time gap between them.
- **FR-004**: The system MUST NOT trigger the LaTeX popup when `:{` is typed inside a code block or inline code context.
- **FR-005**: The system MUST NOT trigger the LaTeX popup when text containing `:{` is pasted into the document.
- **FR-006**: The system MUST remove the old `$` trigger entirely — typing `$` must insert a literal dollar sign.
- **FR-007**: The system MUST preserve all existing LaTeX input popup behavior (AI conversion, Enter to submit, Escape to cancel, quota display) — only the trigger mechanism changes.
- **FR-008**: The system MUST display the LaTeX popup at the cursor position, consistent with current behavior.
- **FR-009**: Existing math nodes already in documents MUST continue to render correctly — this change affects only the input trigger, not stored data.

## Assumptions

- The two-character sequence `:{` does not conflict with any existing TipTap extensions, keyboard shortcuts, or input rules in the application.
- The trigger detection uses keystroke sequence tracking (not text pattern matching on document content) to avoid false positives from paste or programmatic edits.
- There is no need for a configurable trigger — `:{` is the fixed replacement for `$`.
- No migration or data changes are needed since existing math nodes are stored as structured data, not as `$`-delimited text.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can open the LaTeX input popup by typing `:{` with 100% reliability in normal text editing contexts.
- **SC-002**: Typing `$` in the editor inserts a literal dollar sign character with no popup — 0% false trigger rate from the old shortcut.
- **SC-003**: Typing `:` followed by any character other than `{` (including space) never triggers the popup — 0% false positive rate.
- **SC-004**: The LaTeX popup appears within the same perceived time as the previous `$` trigger — no perceptible delay introduced by two-character detection.
- **SC-005**: All existing math expressions in documents continue to display correctly after the change.
