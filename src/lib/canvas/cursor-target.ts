/**
 * Pure rule for where the text cursor should land after a multi-block overflow
 * split in a linked-text-box cascade.
 *
 * Called from `handleTextBoxOverflow` in canvas-editor.tsx. Extracted as a
 * pure function so the rule itself can be unit-tested without any DOM,
 * ProseMirror, or React state — matching the pattern used elsewhere in
 * src/lib/canvas/ (text-split.ts, zoom-physics.ts, page-utils.ts).
 *
 * See specs/035-fix-118-cursor-cascade/research.md, Decision 3.
 */

export type CursorTarget =
  /** Cursor stays in the current text box at its pre-split position. */
  | { kind: 'stay' }
  /**
   * Cursor moves with the overflow into the next page's text box.
   * The new block index is the cursor's position in the overflow-nodes array
   * (which becomes the prefix of the next page's text box content).
   */
  | { kind: 'move'; newBlockIndex: number; offset: number };

/**
 * Decide where the cursor should end up after an overflow split.
 *
 * Rule:
 * - If the user's edited block is BEFORE the split (i.e. it survives on the
 *   current page), the cursor stays. ProseMirror's `deleteRange` mapping
 *   leaves positions strictly before the deleted range unchanged, so no
 *   manual re-selection is needed by the caller.
 * - If the user's edited block is AT OR AFTER the split (i.e. it IS the
 *   overflow, or is past the split boundary), the cursor moves with the
 *   overflow. The caller must set the next page's editor selection at
 *   `(newBlockIndex, offset)` — the within-block offset is preserved.
 *
 * Direction-agnostic: the rule speaks in block indices and text offsets,
 * which are ProseMirror primitives that work identically for LTR and RTL.
 *
 * @param cursorBlockIndex Index of the top-level block containing the cursor
 *                         in the current text box, BEFORE the split. Get it
 *                         from `editor.state.selection.$from.index(0)`.
 * @param cursorOffset     Cursor's text offset within its containing block.
 *                         Get it from `editor.state.selection.$from.parentOffset`.
 * @param splitIndex       First block index that overflows — i.e. the index
 *                         where `deleteRange` starts when handing content off
 *                         to the next page.
 * @returns                `{ kind: 'stay' }` if the cursor survives on the
 *                         current page, or `{ kind: 'move', newBlockIndex,
 *                         offset }` if the cursor moves with the overflow.
 */
export function decideCursorTarget(
  cursorBlockIndex: number,
  cursorOffset: number,
  splitIndex: number,
): CursorTarget {
  if (cursorBlockIndex < splitIndex) {
    return { kind: 'stay' };
  }
  return {
    kind: 'move',
    newBlockIndex: cursorBlockIndex - splitIndex,
    offset: cursorOffset,
  };
}
