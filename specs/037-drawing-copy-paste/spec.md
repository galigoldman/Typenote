# Feature Specification: Drawing Copy/Paste

**Feature Branch**: `037-drawing-copy-paste`
**Created**: 2026-04-10
**Status**: Draft
**Input**: User description: "Copy/paste selected drawing as object (not screenshot), paste via long-press with pen"

## Clarifications

### Session 2026-04-10

- Q: Which tool mode(s) should long-press paste work in? → A: Select mode only — paste long-press only works when the active tool is the selection tool. This eliminates any timing conflict with shape snap (circle/line straightening) which uses ~400ms long-press during active drawing.
- Q: How does paste long-press interact with existing shape snap long-press (perfect circle/line)? → A: No conflict — shape snap only fires during active drawing in pen/highlighter mode. Paste only fires in select mode. The two features operate in mutually exclusive tool states.
- Q: After pasting, should the pasted elements be automatically selected? → A: Yes — pasted elements are immediately selected with the action bar visible, so the user can reposition or re-copy right away.
- Q: Should paste be undoable? → A: Yes — each paste is a single undo step that removes only the most recently pasted item, not all pastes at once.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Copy Selected Drawing via Action Bar (Priority: P1)

A user selects one or more strokes on the canvas using the existing selection tool (rectangle or lasso). A **Copy** button appears in the floating action bar alongside the existing Edit, Ask AI, and Delete buttons. The user taps Copy, and the selected strokes are stored in an internal clipboard — preserving all stroke data (paths, colors, widths, opacity). A brief "Copied!" confirmation appears.

**Why this priority**: Without a copy action, the entire feature is impossible. This is the foundation that everything else builds on.

**Independent Test**: Can be fully tested by selecting strokes, tapping Copy, and verifying the clipboard holds the correct stroke data. Delivers value as a prerequisite for paste.

**Acceptance Scenarios**:

1. **Given** a canvas with drawn strokes and the user is in select mode, **When** the user selects one or more strokes and taps the Copy button, **Then** the selected strokes (with all properties) are stored in the internal clipboard and a "Copied!" confirmation appears briefly.
2. **Given** a selection containing both strokes and text boxes, **When** the user taps Copy, **Then** both strokes and text boxes are copied to the internal clipboard.
3. **Given** a previous copy already exists in the clipboard, **When** the user copies a new selection, **Then** the old clipboard data is replaced with the new selection.

---

### User Story 2 - Paste Drawing via Pen Long-Press (Priority: P1)

After copying a drawing, the user switches to (or remains in) select mode and long-presses on the canvas with the pen (holding for ~500ms). The copied drawing appears at the long-press location as a fully editable clone — it can be selected, moved, resized, edited, and re-copied just like the original. The paste position is centered on where the user pressed, with strokes offset relative to their original bounding box. Long-press paste is exclusive to select mode — it never triggers in pen, highlighter, or eraser modes, which avoids any conflict with the existing shape snap feature (perfect circle/line straightening via long-press during drawing).

**Why this priority**: Paste is the other half of the core feature. Without it, copy is useless.

**Independent Test**: Can be tested by copying a selection, switching to select mode, long-pressing at a target location, and verifying the pasted strokes appear at that location with all original properties preserved and are fully interactive.

**Acceptance Scenarios**:

1. **Given** strokes have been copied to the internal clipboard and the user is in select mode, **When** the user long-presses with the pen (~500ms) at a location on the canvas, **Then** the copied drawing appears centered at that location as new, independent, editable strokes and the pasted elements are automatically selected with the action bar visible.
2. **Given** pasted strokes have just appeared and are auto-selected, **When** the user drags the selection, **Then** the pasted strokes move immediately — no extra tap needed to select them first.
3. **Given** a long-press is initiated but released before 500ms, **When** the press ends, **Then** no paste occurs and normal drawing behavior continues unaffected.
4. **Given** the internal clipboard is empty, **When** the user long-presses with the pen, **Then** nothing happens — no error, no visual disruption.

---

### User Story 3 - Keyboard Copy/Paste for Desktop (Priority: P2)

Desktop users can use standard keyboard shortcuts (Cmd/Ctrl+C to copy, Cmd/Ctrl+V to paste). Copy works when strokes are selected. Paste places the copied drawing at the center of the current viewport (since there's no long-press location on desktop).

**Why this priority**: Important for desktop usability, but the primary target is iPad where pen long-press is the main interaction. This extends reach to desktop users.

**Independent Test**: Can be tested by selecting strokes on desktop, pressing Cmd+C, then Cmd+V, and verifying the drawing appears at the viewport center.

**Acceptance Scenarios**:

1. **Given** strokes are selected on desktop, **When** the user presses Cmd/Ctrl+C, **Then** strokes are copied to the internal clipboard with a "Copied!" confirmation.
2. **Given** strokes have been copied, **When** the user presses Cmd/Ctrl+V, **Then** the drawing appears at the center of the current viewport as new editable strokes.
3. **Given** no strokes are selected, **When** the user presses Cmd/Ctrl+C, **Then** nothing happens.

---

### User Story 4 - Visual Feedback During Long-Press (Priority: P2)

When the user begins a long-press with the pen, a subtle visual indicator (pulsing circle or expanding ring) appears at the press location to signal that a paste is about to happen. If the clipboard is empty, no indicator appears. If the user lifts before the threshold, the indicator disappears.

**Why this priority**: Important for discoverability and preventing accidental pastes, but the core copy/paste works without it.

**Independent Test**: Can be tested by initiating a long-press with clipboard data and verifying the indicator appears, grows, and either completes (paste) or cancels (early lift).

**Acceptance Scenarios**:

1. **Given** the clipboard contains copied strokes, **When** the user begins a pen long-press, **Then** a visual indicator appears at the press location and grows/pulses over the 500ms threshold.
2. **Given** the clipboard is empty, **When** the user begins a pen long-press, **Then** no visual indicator appears.
3. **Given** a long-press indicator is showing, **When** the user lifts the pen before 500ms, **Then** the indicator fades away and no paste occurs.

---

### User Story 5 - Multiple Paste (Priority: P3)

After copying, the user can paste the same drawing multiple times at different locations without needing to re-copy. Each paste creates a new independent clone.

**Why this priority**: Convenience feature that naturally falls out of keeping clipboard data persistent until overwritten. Low effort, nice quality of life.

**Independent Test**: Can be tested by copying once, pasting at 3 different locations, and verifying all 3 pastes are independent editable objects.

**Acceptance Scenarios**:

1. **Given** strokes have been copied, **When** the user pastes at location A then pastes at location B, **Then** two independent copies exist, each at their respective locations.
2. **Given** a pasted copy exists, **When** the user selects and modifies it (move, resize, delete), **Then** other pasted copies and the original are unaffected.

---

### Edge Cases

- What happens when the user copies strokes, navigates to a different page within the same document, then pastes? The clipboard persists across pages within the same document, and paste works on the target page.
- What happens when the user copies strokes and switches to a different document? The clipboard is cleared — copy/paste is scoped to the current document session.
- What happens when the user copies a selection at extreme positions (near page edges) and pastes? Pasted strokes are clamped/offset so they remain within the visible canvas area.
- What happens if the user moves their pen during a long-press (before the 500ms threshold)? If the pen moves more than a small tolerance (~5px), the long-press is cancelled and normal drawing begins.
- What happens if the user long-presses with a finger instead of a pen? Finger long-press does NOT trigger paste — only pen long-press does. This preserves existing finger behaviors (scrolling, zooming).
- What happens if the user long-presses in pen/highlighter mode (where shape snap exists)? Nothing — paste is exclusive to select mode. Shape snap (perfect circle/line) continues to work exactly as before in drawing modes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a Copy button in the floating action bar when strokes or text boxes are selected.
- **FR-002**: Copy MUST store all selected elements (strokes and text boxes) with their full data (points, colors, widths, opacity, bounding boxes, text content) in an internal application clipboard.
- **FR-003**: System MUST detect pen long-press events (sustained press without significant movement for ~500ms) exclusively in select mode.
- **FR-004**: Long-press paste MUST only trigger for pen input, not finger or mouse input.
- **FR-011**: Long-press paste MUST NOT activate in pen, highlighter, or eraser modes — these modes use long-press for shape snap (perfect circle/line straightening) and must remain unaffected.
- **FR-012**: After paste, the pasted elements MUST be automatically selected with the floating action bar visible, allowing immediate repositioning or re-copying.
- **FR-013**: Each paste action MUST be undoable as a single undo step, removing only the most recently pasted item (not all prior pastes).
- **FR-005**: Paste MUST create new, fully independent copies of all clipboard elements at the long-press location, with new unique IDs and updated positions.
- **FR-006**: Pasted elements MUST be fully editable — selectable, movable, resizable, deletable, and re-copyable — with identical behavior to originally created elements.
- **FR-007**: System MUST support keyboard shortcuts Cmd/Ctrl+C (copy with active selection) and Cmd/Ctrl+V (paste at viewport center) for desktop users.
- **FR-008**: System MUST show visual feedback during a pen long-press when the clipboard contains data, indicating a paste is about to occur.
- **FR-009**: Clipboard contents MUST persist until overwritten by a new copy or the user leaves the document.
- **FR-010**: System MUST NOT interfere with normal drawing, selection, or gesture behaviors (pinch-zoom, scroll, etc.) when no long-press is detected.

### Key Entities

- **Clipboard**: Temporary in-memory store holding copied element data (strokes and/or text boxes) with their relative positions anchored to a common origin (the center of the original selection bounding box).
- **Stroke**: A drawn path with points, color, width, opacity, and bounding box — the primary copyable element.
- **Text Box**: A rich-text region with position, dimensions, and content — a secondary copyable element when part of a mixed selection.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can copy a selected drawing and paste it at a new location in under 3 seconds (select, copy, long-press paste).
- **SC-002**: Pasted drawings are visually identical to the original — same colors, widths, opacity, and relative stroke positioning.
- **SC-003**: Pasted drawings are fully functional — 100% of selection, move, resize, delete, and re-copy operations work identically to original drawings.
- **SC-004**: Long-press paste does not trigger during normal drawing — zero false positives during standard pen strokes and taps.
- **SC-005**: Users can paste the same copied drawing at least 10 times without needing to re-copy.
- **SC-006**: Desktop users can complete the full copy/paste flow using only keyboard shortcuts.

## Assumptions

- The primary platform is iPad with Apple Pencil; desktop (mouse/keyboard) is secondary.
- Copy/paste is scoped to the current document — clipboard does not persist across documents.
- The ~500ms long-press threshold is a starting point and may be tuned based on user testing.
- The movement tolerance for cancelling a long-press (~5px) is a reasonable default to prevent accidental pastes.
- Only pen input triggers long-press paste. On desktop, keyboard Cmd/Ctrl+V replaces the long-press mechanism.
- The internal clipboard is an in-memory data structure, not the OS clipboard — this preserves full object fidelity.
