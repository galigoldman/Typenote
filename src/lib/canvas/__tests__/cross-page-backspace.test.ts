import { describe, it, expect } from 'vitest';
import { shouldInterceptBackspaceAtStart } from '../cross-page-backspace';

describe('shouldInterceptBackspaceAtStart', () => {
  it('intercepts a collapsed cursor at the very start of the first block', () => {
    // Empty selection at doc position 1 (offset 0 inside the first block).
    expect(shouldInterceptBackspaceAtStart({ from: 1, empty: true })).toBe(
      true,
    );
  });

  it('intercepts a collapsed cursor at position 0 (before the first block)', () => {
    expect(shouldInterceptBackspaceAtStart({ from: 0, empty: true })).toBe(
      true,
    );
  });

  it('does NOT intercept when a non-empty selection starts at the start', () => {
    // This is the Ctrl+A case: selection spans from 1 to end-of-page. We must
    // let ProseMirror delete the selection natively instead of swallowing it
    // and triggering a cross-page merge.
    expect(shouldInterceptBackspaceAtStart({ from: 1, empty: false })).toBe(
      false,
    );
  });

  it('does NOT intercept a collapsed cursor in the middle of a block', () => {
    // from > 1 means there is a character before the cursor; ProseMirror's
    // native joinBackward/delete handles it.
    expect(shouldInterceptBackspaceAtStart({ from: 5, empty: true })).toBe(
      false,
    );
  });

  it('does NOT intercept a non-empty selection in the middle', () => {
    expect(shouldInterceptBackspaceAtStart({ from: 5, empty: false })).toBe(
      false,
    );
  });
});
