/**
 * Pure rule for whether a Backspace keystroke inside a page's text box should
 * be intercepted and handed off to the cross-page merge handler (which pulls
 * the first block of this page up into the previous page, Word/Docs-style).
 *
 * Extracted as a pure function so the guard can be unit-tested without DOM,
 * ProseMirror, or React — matching cursor-target.ts / text-split.ts.
 *
 * Called from text-box.tsx `handleKeyDown`.
 *
 * The critical rule is the `empty` check: we must ONLY intercept when the
 * selection is collapsed (a bare cursor). When the selection is a non-empty
 * RANGE that merely *starts* at the document start — which is exactly what a
 * Ctrl+A select-all looks like — Backspace must fall through to ProseMirror's
 * native "delete the selection" behavior. The original guard checked only
 * `from <= 1`, so it swallowed every select-all delete (the #2 regression
 * introduced in commit 7c33153).
 */
export function shouldInterceptBackspaceAtStart(selection: {
  /** `view.state.selection.from` — the lower bound of the selection. */
  from: number;
  /** `view.state.selection.empty` — true when the cursor is collapsed. */
  empty: boolean;
}): boolean {
  // Only a collapsed cursor sitting at the very start of the first block.
  // Position 1 = offset 0 inside the first block; position 0 = before it.
  return selection.empty && selection.from <= 1;
}
