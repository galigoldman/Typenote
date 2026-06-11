import { describe, it, expect } from 'vitest';
import {
  classifyUndoRedo,
  isEditableTarget,
} from '../keyboard-shortcuts';

/**
 * The canvas (draw/select mode) has no native browser undo, so the editor
 * wires Ctrl/Cmd+Z (and friends) to its own history stack. These pure helpers
 * encode (a) which key combos mean undo vs redo and (b) when to stand down so
 * a contenteditable text box handles its own undo instead of double-firing.
 */

describe('classifyUndoRedo', () => {
  it('maps Ctrl+Z to undo', () => {
    expect(
      classifyUndoRedo({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false }),
    ).toBe('undo');
  });

  it('maps Cmd+Z (mac) to undo', () => {
    expect(
      classifyUndoRedo({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: false }),
    ).toBe('undo');
  });

  it('maps Ctrl+Shift+Z to redo', () => {
    expect(
      classifyUndoRedo({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: true }),
    ).toBe('redo');
  });

  it('maps Cmd+Shift+Z (mac) to redo', () => {
    expect(
      classifyUndoRedo({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: true }),
    ).toBe('redo');
  });

  it('maps Ctrl+Y to redo (Windows convention)', () => {
    expect(
      classifyUndoRedo({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false }),
    ).toBe('redo');
  });

  it('is case-insensitive on the key (shift produces uppercase "Z")', () => {
    expect(
      classifyUndoRedo({ key: 'Z', ctrlKey: true, metaKey: false, shiftKey: true }),
    ).toBe('redo');
  });

  it('returns null when no modifier is held', () => {
    expect(
      classifyUndoRedo({ key: 'z', ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toBeNull();
  });

  it('returns null for unrelated keys', () => {
    expect(
      classifyUndoRedo({ key: 'a', ctrlKey: true, metaKey: false, shiftKey: false }),
    ).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('returns false for null', () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it('returns false for a plain div', () => {
    const div = document.createElement('div');
    expect(isEditableTarget(div)).toBe(false);
  });

  it('returns true for an <input>', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
  });

  it('returns true for a <textarea>', () => {
    const ta = document.createElement('textarea');
    expect(isEditableTarget(ta)).toBe(true);
  });

  it('returns true for a contenteditable element (the TipTap text box)', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(el)).toBe(true);
  });

  it('returns true for a node nested inside a contenteditable host', () => {
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    host.appendChild(child);
    expect(isEditableTarget(child)).toBe(true);
  });
});
