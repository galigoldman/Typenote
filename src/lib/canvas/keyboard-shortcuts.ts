/**
 * Pure helpers for the canvas editor's keyboard shortcuts.
 *
 * A canvas surface gets no native editing shortcuts from the browser, so the
 * editor wires its own undo/redo history to the keyboard. These helpers are
 * kept pure (no DOM listeners) so they can be unit-tested in isolation.
 */

interface ModifierKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Classify a keyboard event into an undo/redo intent, or null if it is neither.
 *
 * - Undo: Ctrl+Z / Cmd+Z (without Shift)
 * - Redo: Ctrl+Shift+Z / Cmd+Shift+Z, or Ctrl+Y (Windows convention)
 */
export function classifyUndoRedo(e: ModifierKeyEvent): 'undo' | 'redo' | null {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return null;
  const key = e.key.toLowerCase();
  if (key === 'y') return 'redo';
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  return null;
}

/**
 * Whether the event target is (or is inside) an editable element — an input,
 * a textarea, or a contenteditable host such as the TipTap text box. When true,
 * the canvas should NOT handle the undo shortcut itself: the editable element's
 * own history (e.g. ProseMirror's keymap) owns it, and double-handling would
 * undo twice.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof globalThis.Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  return target.closest('[contenteditable="true"], [contenteditable=""]') !== null;
}
