import { describe, it, expect } from 'vitest';
import { decideCursorTarget } from '@/lib/canvas/cursor-target';

describe('decideCursorTarget', () => {
  describe('"stay" branch — cursor is before the split', () => {
    it('returns "stay" when cursor is in a block well before the split', () => {
      expect(decideCursorTarget(5, 0, 15)).toEqual({ kind: 'stay' });
    });

    it('returns "stay" when cursor is one block before the split', () => {
      expect(decideCursorTarget(14, 3, 15)).toEqual({ kind: 'stay' });
    });

    it('returns "stay" when cursor is at the top of a page (index 0) and split is later', () => {
      expect(decideCursorTarget(0, 0, 5)).toEqual({ kind: 'stay' });
    });

    it('ignores the cursor offset in the "stay" branch (offset is preserved by ProseMirror selection mapping)', () => {
      // Whether the offset is 0 or 42 doesn't matter — the decision only
      // depends on block index vs split index. The caller relies on
      // ProseMirror to keep the selection through the deleteRange.
      expect(decideCursorTarget(3, 0, 10)).toEqual({ kind: 'stay' });
      expect(decideCursorTarget(3, 42, 10)).toEqual({ kind: 'stay' });
    });
  });

  describe('"move" branch — cursor is at or past the split', () => {
    it('returns "move" with newBlockIndex 0 when cursor is exactly at the boundary block', () => {
      // The boundary block is the first block that overflows. The cursor
      // lives in it, so after the move the cursor is on block 0 of the
      // overflow (which becomes block 0 of the next page's text box).
      expect(decideCursorTarget(15, 0, 15)).toEqual({
        kind: 'move',
        newBlockIndex: 0,
        offset: 0,
      });
    });

    it('returns "move" with newBlockIndex = cursorBlockIndex - splitIndex when cursor is past the split', () => {
      // Cursor at block 18, split at 15 → new block index in the overflow = 3
      expect(decideCursorTarget(18, 0, 15)).toEqual({
        kind: 'move',
        newBlockIndex: 3,
        offset: 0,
      });
    });

    it('preserves the within-block offset across the move', () => {
      // User typed at offset 42 in block 20; block 20 moves to the next page
      // as the 4th block (20 - 17 = 3). The offset must still be 42.
      expect(decideCursorTarget(20, 42, 17)).toEqual({
        kind: 'move',
        newBlockIndex: 3,
        offset: 42,
      });
    });

    it('returns "move" when both cursor and split are at block 0 (edge case: first block overflows)', () => {
      // Pathological: the very first block of the page overflows, and the
      // cursor is in it. The cursor moves to block 0 of the next page.
      expect(decideCursorTarget(0, 0, 0)).toEqual({
        kind: 'move',
        newBlockIndex: 0,
        offset: 0,
      });
    });
  });
});
