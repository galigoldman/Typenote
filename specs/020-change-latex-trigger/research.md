# Research: Change LaTeX Trigger from $ to :{

## R1: Two-Character Trigger Detection Strategy

**Decision**: Use the "insert-then-cleanup" approach — check the preceding document character when `{` is pressed.

**Rationale**: When `{` is typed, the `handleKeyDown` ProseMirror plugin checks if the character immediately before the cursor is `:` using `state.doc.textBetween(pos - 1, pos)`. If yes, delete the `:` via a ProseMirror transaction, prevent `{` insertion, and fire the trigger event. This is simpler than maintaining keystroke state across events and naturally handles:

- **Paste protection**: `handleKeyDown` only fires on real keystrokes, not paste
- **Intervening characters**: If anything was typed between `:` and `{`, the preceding char won't be `:`, so no false trigger
- **Code contexts**: Existing code block / inline code guards transfer directly

**Alternatives considered**:

- **Timer-based state tracking**: Track when `:` was pressed, expire after N ms. Rejected — adds complexity, introduces a magic timeout value, and the character-check approach handles the same cases without timers.
- **ProseMirror InputRule**: TipTap's `addInputRules()` can match text patterns. Rejected — InputRules work on committed text and would insert `:{` before matching, making cleanup messy. They also fire on paste, violating FR-005.
- **Buffering `:` (Option B from clarification)**: Delay inserting `:` until next keystroke. Rejected by user — causes perceived lag on a frequently-typed character.

## R2: Colon Deletion Transaction

**Decision**: Use `state.tr.delete(pos - 1, pos)` to remove the `:` character, then dispatch the transaction before firing the custom event.

**Rationale**: ProseMirror transactions are the canonical way to modify document content. Deleting one character before the cursor is a single operation. The `coordsAtPos` call for popup positioning should use `pos - 1` (the position after deletion) to correctly place the popup where the cursor now sits.

**Alternatives considered**:

- **`view.dispatch(state.tr.replaceWith(pos - 1, pos, Fragment.empty))`**: Equivalent but more verbose. `delete` is the idiomatic method.
- **Undo-aware approach**: Could use `state.tr.setMeta('addToHistory', false)` to make the colon deletion invisible to undo. Rejected — keeping it in history is fine; if the user cancels the popup, the colon is already deleted which is acceptable since it was consumed by the trigger attempt.

## R3: Impact on Canvas Editor

**Decision**: No changes needed in canvas editor code.

**Rationale**: Both `tiptap-editor.tsx` and `canvas-editor.tsx` consume the `math-input-trigger` custom event dispatched from the ProseMirror plugin. The trigger mechanism is fully encapsulated in `math-extension.ts`. Changing the plugin there propagates to both editors automatically. Only comment updates referencing `$` are needed.

## R4: Existing Test Coverage

**Decision**: Update `math-extension.test.ts` with new trigger behavior tests. `math-input-box.test.tsx` requires no changes (popup behavior is unchanged).

**Rationale**: Current `math-extension.test.ts` only tests the node schema (attributes, parsing, rendering) — it has no tests for the `handleKeyDown` plugin behavior. New tests should cover the `:{` trigger, false-positive prevention, and code-context suppression using a real TipTap editor instance with `@tiptap/pm` test utilities.
