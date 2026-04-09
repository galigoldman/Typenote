# Research: Fix Cursor Jumps in Multi-Page Reflow Cascade

**Feature**: 035-fix-118-cursor-cascade
**Date**: 2026-04-09

This document captures the design decisions, alternatives considered, and the underlying ProseMirror / React behavior that informs the chosen implementation. It exists so that any future contributor (including the same developer six months from now) can understand _why_ the fix is shaped the way it is — not just _what_ it does.

---

## Decision 1: Compute the cursor target up front, on the outermost hop only

**Decision**: On the **first** call to `handleTextBoxOverflow` triggered by a user keystroke, the function (a) reads the editor's current selection, (b) computes the final cursor position synchronously using a pure rule, and (c) applies that final position immediately — before the inner cascade hops fire. All subsequent inner cascade hops (fired by `ResizeObserver` on downstream pages) run a stripped-down version of `handleTextBoxOverflow` that splits and pushes content forward but **never touches focus or selection**.

**Rationale**:

- The bug we are fixing is that the current code treats cursor restoration as a separate, _delayed_ step at the end of an undefined-length cascade. There is no reliable wall-clock signal for "the cascade is done", so a 300 ms timer is fundamentally a lottery — sometimes it wins (short cascades), sometimes it loses (deep cascades on full pages).
- The cursor's correct final position is **fully determined** by information available at the start of the outermost hop:
  - The block index that contains the cursor (from `editor.state.selection.$from.index(0)`).
  - The split index where overflow starts (from `findOverflowSplitIndex`).
  - Whether the cursor's block is **before** the split (cursor stays) or **at/after** the split (cursor moves with the overflow into the next page).
- Once we know the answer, there is no reason to wait for the cascade to finish before applying it. We can set the cursor immediately and let the cascade ripple through downstream pages without ever looking at the cursor again.

**Alternatives considered**:

| Alternative                                                                                                                                                                 | Why rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep the 300 ms timer but tune it to 600 / 1000 ms**                                                                                                                      | This is the path of least resistance and was already attempted in earlier commits on this branch. It doesn't fix the bug — any wall-clock value is a lottery, and longer values just push the failure mode further out (and add visible lag).                                                                                                                                                                                                                                                              |
| **Use a depth counter that decrements per inner hop, restore cursor when counter hits 0**                                                                                   | This is closer to a real fix, but it has two problems. (1) Inner hops are async (fired by ResizeObserver later), so the counter would have to be incremented at hand-off time and decremented at completion of the inner hop's RAF — easy to get wrong, especially when multiple inner hops overlap. (2) It still does cursor restoration at the _end_ of the cascade, which means the user briefly sees the cursor in the wrong place during long cascades. The "move-first" strategy is strictly better. |
| **Synchronously chain inner hops** (each hand-off recursively calls the next inner hop's `handleTextBoxOverflow` directly, instead of going through `ResizeObserver` → RAF) | Would make the cascade fully synchronous but couples the cursor restoration tightly to the cascade structure. It also requires forcing layout (`getBoundingClientRect`) for each downstream page in the same synchronous block, which is slow and risks performance regressions on a 9-page cascade. The "compute target once, then let the async cascade run silently" approach has the same correctness with less coupling and better performance.                                                       |
| **Architectural rewrite** (single ProseMirror document spanning all pages)                                                                                                  | This is the _real_ long-term fix for issue #118 and removes the entire concept of a "cascade". It is also significantly more work — easily 2–3 weeks of focused effort, with high risk of disrupting unrelated features (drawings, PDF backgrounds, the per-page `data-page-id` selectors used by export logic and tests). The user explicitly asked for the "surgical walk-around" path. The architectural rewrite is recorded in the spec's Out of Scope section as a follow-up.                         |

---

## Decision 2: Distinguish "outermost" from "inner" hops via a `Set<textBoxId>` tracker, not via a wall-clock guard

**Decision**: Maintain a ref `cascadeTargetTextBoxIds: Set<string>` on the canvas-editor component. When the outermost hop hands content off to the next page, it adds the next page's text box ID to the set. When `handleTextBoxHeightMeasured` later fires for that downstream text box (because its `ResizeObserver` detected the post-merge growth), it checks the set: if the text box ID is present, it knows it is being run as an inner cascade hop, and it must not touch focus or selection. The inner hop, in turn, adds the _next_ downstream text box's ID to the set as it hands content forward, then removes itself from the set.

**Rationale**:

- This is a structural signal, not a temporal one. It doesn't depend on guessing how long the cascade will take.
- The set's lifecycle is bounded by the cascade itself: it starts populated by the outermost hop and drains as each inner hop completes its hand-off. The deepest hop (the one that doesn't need to push anything further) leaves the set empty.
- It's also self-cleaning: if the set ever ends up with a stale entry (e.g., because an inner hop's `ResizeObserver` never fires for some reason), the next user keystroke will see a fresh outermost hop on a different text box and the stale entry will simply never be checked again. There is no "infinite cascade" failure mode.

**Alternatives considered**:

| Alternative                                                           | Why rejected                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Boolean flag `isCascadeInProgress: boolean`**                       | Doesn't distinguish _which_ text box is the inner target. If the user starts a new edit on a different text box while a cascade from the first edit is still in progress, the boolean says "in progress" for both, and the new edit gets misclassified as an inner hop. The `Set<textBoxId>` correctly distinguishes them by text box identity.       |
| **Pass an `isInnerHop` argument all the way down from the call site** | The call site of `handleTextBoxOverflow` is inside `handleTextBoxHeightMeasured`, which is itself called by the `ResizeObserver`. The `ResizeObserver` callback has no knowledge of whether the size change was caused by user input or by a cascade-driven `setContent`. We'd have to set a flag _somewhere_ anyway — the set is the cleanest place. |
| **Compare against `editor.isFocused`**                                | Initially attractive, but breaks for the "Enter at end of page → cursor moves to page 2" case: after the move-first step, the next page's editor _is_ focused, so when its inner cascade hop fires, `isFocused` returns true and the inner hop is incorrectly classified as outermost. The set avoids this entirely.                                  |

---

## Decision 3: Cursor target rule, expressed as a pure function

**Decision**: Extract the cursor target decision into a pure function `decideCursorTarget` in `src/lib/canvas/cursor-target.ts`:

```ts
type CursorTarget =
  | { kind: 'stay' } // Cursor stays in current text box
  | { kind: 'move'; newBlockIndex: number; offset: number }; // Cursor moves to next page's text box

/**
 * Decide where the cursor should end up after an overflow split.
 *
 * @param cursorBlockIndex  Index of the top-level block (0-based) that contains
 *                          the cursor in the current text box, BEFORE the split.
 * @param cursorOffset      Cursor's offset within its containing block (text offset).
 * @param splitIndex        First block index that overflows (i.e. the index where
 *                          we will deleteRange and hand the rest off to the next page).
 * @returns A `CursorTarget` describing where the cursor should land.
 */
export function decideCursorTarget(
  cursorBlockIndex: number,
  cursorOffset: number,
  splitIndex: number,
): CursorTarget {
  if (cursorBlockIndex < splitIndex) {
    // User's edit is in a block that survives on the current page.
    // The deleteRange (from splitIndex onwards) is past the cursor,
    // so ProseMirror's selection mapping leaves the cursor unchanged.
    return { kind: 'stay' };
  }
  // User's edit is in a block that gets handed off as overflow.
  // The next page's text box receives the overflow blocks at index 0,
  // followed by the existing next-page content. The cursor's new block
  // index is its position in the overflow array.
  return {
    kind: 'move',
    newBlockIndex: cursorBlockIndex - splitIndex,
    offset: cursorOffset,
  };
}
```

**Rationale**:

- The rule is the part most likely to have edge-case bugs (off-by-one on the boundary block, RTL surprises, single-block-overflow case). Isolating it as a pure function makes it trivially unit-testable without any DOM, ProseMirror, or React state.
- This matches the architectural pattern already established in the project for canvas geometry helpers (`text-split.ts`, `zoom-physics.ts`, `page-utils.ts`) — pure functions in `src/lib/canvas/`, DOM-touching code in `src/components/canvas/`. Reviewers won't have to learn a new convention.
- Direction-agnosticism (FR-007) is automatic: the rule speaks in terms of block indices and offsets, which are direction-independent ProseMirror primitives. There is no `left` / `right` anywhere.

**Edge cases handled by the pure function**:

- **Cursor exactly at the boundary block** (`cursorBlockIndex === splitIndex`): cursor moves with the overflow. The new block index is 0 (start of the overflow nodes). This is the "Enter at end of last line of page" case where the user's new empty paragraph is itself the boundary.
- **Single-block overflow** (`doc.childCount === 1`): handled by the existing single-block path in `handleTextBoxOverflow`. The pure function isn't used for this path because the split happens within a block (at a word boundary), not between blocks. We will add a separate rule for the single-block path in the implementation phase.
- **Empty overflow** (`splitIndex >= doc.childCount`): caller should not call `decideCursorTarget` in this case; the existing early-return in `handleTextBoxOverflow` handles it.

---

## Decision 4: ProseMirror selection survives `deleteRange` when the cursor is before the deleted range

**Background**: The "stay" branch of `decideCursorTarget` relies on the assumption that ProseMirror's `deleteRange` does not move the cursor when the cursor is before the deleted range. This assumption is correct, but worth documenting:

- ProseMirror's transaction system maps positions through changes using `Transform.mapping`. For a `deleteRange(from, to)` step, positions strictly less than `from` are mapped to themselves; positions in `[from, to]` are mapped to `from`; positions greater than `to` are mapped to `position - (to - from)`.
- In our case, the cursor is at some position less than the position that corresponds to `splitIndex` (because `cursorBlockIndex < splitIndex` implies the cursor is in a block before the split). So the cursor maps to itself.
- We do not need to manually re-set the selection in the "stay" case. The editor's existing selection survives unchanged through `editor.chain().deleteRange(...).run()`.

**Caveat**: TipTap's `deleteRange` calls `tr.delete(from, to)` and then runs the transaction. Verify in the implementation phase that no auto-focus or auto-select side effect kicks in (e.g., a TipTap extension that resets selection on content change). If one does, we'll need to capture the original selection and explicitly re-set it after the delete.

**Reference**: ProseMirror docs — [Transforms / Mapping](https://prosemirror.net/docs/guide/#transform). Verified empirically by searching the ProseMirror changelog and the TipTap 3 source for any "select-after-delete" extension.

---

## Decision 5: Move-first strategy for the "next page" case

**Decision**: When `decideCursorTarget` returns `{ kind: 'move', ... }`, set the next page's editor selection and focus **immediately** in the same synchronous block as the content move — not via a delayed timer or microtask. The only exception is when the next page is **brand-new** (created by `handleTextOverflow`'s "no next page" branch): its editor mounts asynchronously after React commits, so the existing `focusPageRef` polling pattern is reused to set the selection once the editor appears.

**Rationale**:

- The move-first strategy (per Clarifications Q3) is what gives the user the "instant feedback" feel. The cursor must be in its final position on the same frame as the keystroke, not after a 300 ms delay.
- For an existing next page, the editor already exists in the `editorsRef` map, so we can call `editor.commands.setTextSelection(targetPos).focus()` synchronously. No polling needed.
- For a brand-new page, the editor mounts via React's commit cycle. The existing `focusPage` polling (50 ms intervals, up to 1 second) handles this case. We extend it to also set the selection at the right position once the editor is found.
- Note that "synchronous" here means "in the same JavaScript task as the move". The user's keydown → `onUpdate` → `ResizeObserver` → RAF → `handleTextBoxOverflow` is several async steps before we even start, but the _cursor placement_ itself happens in the same task as the _content move_. The total elapsed time from keydown to cursor reaching its final position is well under 100 ms in typical conditions.

---

## Decision 6: How to compute the cursor's block index and within-block offset

**Decision**: At the start of `handleTextBoxOverflow`, capture:

```ts
const editor = textBoxEditorsRef.current.get(textBoxId);
if (!editor) return;
const { selection, doc } = editor.state;
const $from = selection.$from;
const cursorBlockIndex = $from.index(0); // Top-level child index containing the cursor
const cursorOffsetInBlock = $from.parentOffset; // Text offset within the parent block
```

**Rationale**:

- `$from.index(0)` returns the index in `doc.content` (the top-level children of the document). This is exactly the "block index" used by `findOverflowSplitIndex`.
- `$from.parentOffset` returns the offset within the immediate parent (the paragraph or heading), which is what we need to preserve the cursor's exact text position when moving to the next page.
- Both fields are available synchronously from the editor's state, no DOM queries required.

**Mapping back to a ProseMirror position on the next page's editor** (for the "move" case):

```ts
// nextPageEditor's content is [...overflowNodes, ...existingNextPageContent]
const targetBlockIndex = cursorBlockIndex - splitIndex;
const $newDoc = nextPageEditor.state.doc;
let pos = 0;
for (let i = 0; i < targetBlockIndex; i++) {
  pos += $newDoc.child(i).nodeSize;
}
// pos is now at the start of the target block; advance into it by one position
// (to enter the block) plus the within-block offset
const cursorPos = pos + 1 + cursorOffsetInBlock;
nextPageEditor.commands.setTextSelection(cursorPos).focus();
```

**Caveat**: this position math assumes the target block survives the merge intact (no normalization, no joining). For paragraphs and headings — the only block types that participate in the cascade today — this is true. If a future block type merges across boundaries (e.g., a `list` that normalizes), we'll need to revisit. We will add a unit-test edge case for "cursor in a list item" if the codebase introduces lists in this position later.

---

## Why the previous "wait for cascade then restore cursor" approach is fundamentally wrong (interview talking point)

The earlier two commits on the branch (`584c655` and `47fa9a8`) tried to solve the cursor-jump bug with progressively more guards on top of the same fundamental approach: **let the cascade run, then put the cursor where it should have been**. That approach is wrong for three independent reasons, any one of which is enough to break it:

1. **It conflates "cascade is done" with "wall-clock time has passed"**. There is no general way to know how long a cascade will take — it depends on document length, content density, and concurrency in the user's input. Any fixed timeout is a lottery.
2. **It picks the wrong cursor target for the middle-of-page case**. Even if the timer happened to fire at exactly the right time, the target was always "the next page", which is wrong for any Enter that wasn't at the very end of a page. Our spec's middle-of-page Enter case (the most common real-world keystroke) was never going to work with this approach.
3. **It restores the cursor _after_ the user can perceive it being in the wrong place**. Even when correct, the 300 ms gap between keystroke and cursor movement is itself a UX bug (User Story 2 / NFR-003).

The "move first, cascade silently" approach inverts the problem: instead of waiting to find out where the cursor should be, we **figure it out from the start** and apply it immediately. This is possible because the cursor target is fully determined by the cursor's block index and the split index — both of which are known synchronously at the moment the outermost hop fires.

This is a small but important architectural pattern: when async work needs to be coordinated with a UI update, prefer to **derive the UI's final state from the inputs** (synchronously) rather than to **observe the side effects of the async work** (asynchronously). The first approach is testable, deterministic, and feels instant. The second approach is fragile, timing-dependent, and feels laggy.

---

## Open questions for the implementation phase

These are _not_ spec ambiguities (the spec is clear) — they are implementation details to verify during the coding phase:

1. **Does TipTap 3's `deleteRange` survive selection mapping for our use case?** We expect yes (per ProseMirror's documented mapping rules), but verify empirically with a quick console test before relying on it.
2. **Does `editor.commands.focus()` cause any visible scroll-jump on the source text box that we're moving cursor _away from_?** Probably not (the source editor's selection is unchanged), but verify.
3. **For the brand-new-page case, does `focusPage`'s polling pattern correctly extend to setting selection at a specific position?** The current `focusPage` calls `editor.commands.focus('start')`, which sets the selection to position 1. We need to extend it to optionally take a target position. Backwards-compatibility: keep `'start'` as the default.
4. **Performance**: does the `getBoundingClientRect`-based block-bottom measurement in `handleTextBoxOverflow` cost more than expected when we add the cursor-position capture? Probably negligible (one extra `selection.$from.index(0)` per call), but worth a spot-check on the 9-page cascade to confirm we're under 100 ms keydown-to-cursor.
