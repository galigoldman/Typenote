import { describe, it, expect } from 'vitest';
import { isDrawTool } from '../canvas-tool-helpers';

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
