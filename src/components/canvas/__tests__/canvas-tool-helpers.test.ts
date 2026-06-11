import { describe, it, expect } from 'vitest';
import {
  isDrawTool,
  canUndoForTool,
  canRedoForTool,
} from '../canvas-tool-helpers';

describe('isDrawTool', () => {
  it('returns true for pen', () => {
    expect(isDrawTool('pen')).toBe(true);
  });

  it('returns true for highlighter', () => {
    expect(isDrawTool('highlighter')).toBe(true);
  });

  it('returns true for eraser', () => {
    expect(isDrawTool('eraser')).toBe(true);
  });

  it('returns true for select (now a Draw sub-tool)', () => {
    expect(isDrawTool('select')).toBe(true);
  });

  it('returns false for text', () => {
    expect(isDrawTool('text')).toBe(false);
  });

  it('returns false for read', () => {
    expect(isDrawTool('read')).toBe(false);
  });

  it('returns false for crop', () => {
    expect(isDrawTool('crop')).toBe(false);
  });
});

/**
 * Undo/redo availability gate. Draw tools AND select share the canvas history
 * stack (canUndoDraw), while text mode delegates to the TipTap editor
 * (canUndoText). The previous gate left `select` ungated, so deleting/moving an
 * object in select mode could not be undone and the toolbar button was greyed
 * out even though the history stack had an entry. These tests pin the fix.
 */
describe('canUndoForTool', () => {
  it('reflects the draw stack for pen', () => {
    expect(canUndoForTool('pen', true, false)).toBe(true);
    expect(canUndoForTool('pen', false, false)).toBe(false);
  });

  it('reflects the draw stack for select (regression: was always false)', () => {
    expect(canUndoForTool('select', true, false)).toBe(true);
    expect(canUndoForTool('select', false, false)).toBe(false);
  });

  it('reflects the draw stack for eraser and highlighter', () => {
    expect(canUndoForTool('eraser', true, false)).toBe(true);
    expect(canUndoForTool('highlighter', true, false)).toBe(true);
  });

  it('reflects the TipTap editor for text mode', () => {
    expect(canUndoForTool('text', false, true)).toBe(true);
    expect(canUndoForTool('text', true, false)).toBe(false);
  });

  it('is false in read mode (no editing path)', () => {
    expect(canUndoForTool('read', true, true)).toBe(false);
  });
});

describe('canRedoForTool', () => {
  it('reflects the draw stack for select (regression: was always false)', () => {
    expect(canRedoForTool('select', true, false)).toBe(true);
    expect(canRedoForTool('select', false, false)).toBe(false);
  });

  it('reflects the TipTap editor for text mode', () => {
    expect(canRedoForTool('text', false, true)).toBe(true);
  });

  it('is false in read mode', () => {
    expect(canRedoForTool('read', true, true)).toBe(false);
  });
});
