import { describe, it, expect } from 'vitest';
import { findOverflowSplitIndex, findStraddlingSplitPos } from '../text-split';

const PAGE_HEIGHT = 1123;

describe('findOverflowSplitIndex', () => {
  it('returns null when no block overflows', () => {
    const blockBottoms = [200, 400, 600, 800, 1000];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBeNull();
  });

  it('returns null for an empty block list', () => {
    expect(findOverflowSplitIndex([], PAGE_HEIGHT)).toBeNull();
  });

  it('returns the index of the first overflowing block', () => {
    // Blocks at 300, 600, 900, 1200, 1500
    // Block index 3 (bottom=1200) is the first to exceed 1123
    const blockBottoms = [300, 600, 900, 1200, 1500];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBe(3);
  });

  it('returns null when the first block itself overflows — caller must split within block 0', () => {
    // Single block that exceeds the page. There is no valid block-level split
    // (we can't keep "at least one block" on the current page because the
    // single block is the thing that is overflowing). The caller must fall
    // through to the word-boundary path inside block 0.
    const blockBottoms = [1500];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBeNull();
  });

  it('returns null when block 0 overflows in a multi-block doc — caller must split block 0 inline', () => {
    // Block 0 itself is past page height. A multi-block split at index 1 would
    // leave block 0 still overflowing, so it is not a useful split. Returning
    // null signals the caller to fall through to the single-block word-boundary
    // split, which can actually relieve the overflow by breaking block 0.
    const blockBottoms = [1200, 1500, 1800];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBeNull();
  });

  it('returns correct index when block 0 fits but block 1 overflows', () => {
    // Regression guard: the block-0 behavior change above must NOT break the
    // ordinary "middle block overflows" case.
    const blockBottoms = [600, 1500, 1800];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBe(1);
  });

  it('handles block 0 exactly at the boundary with block 1 overflowing', () => {
    // Block 0 bottom === PAGE_HEIGHT (not overflowing — strict >), block 1 overflows.
    // Expected: split at index 1 (block 0 stays, block 1 moves).
    const blockBottoms = [PAGE_HEIGHT, 1400];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBe(1);
  });

  it('handles exact page height boundary — no overflow', () => {
    const blockBottoms = [500, PAGE_HEIGHT];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBeNull();
  });

  it('handles one pixel past boundary', () => {
    const blockBottoms = [500, PAGE_HEIGHT + 1];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBe(1);
  });

  it('handles large paste with many blocks spanning multiple pages', () => {
    // 20 blocks, each ~200px tall → overflow starts at block 6
    const blockBottoms = Array.from({ length: 20 }, (_, i) => (i + 1) * 200);
    // Block 5 bottom = 1200, which exceeds 1123
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBe(5);
  });

  it('preserves formatting by returning correct index for varied block heights', () => {
    // Heading (80px), paragraph (40px), list (120px), paragraph (40px), heading (80px)
    // Cumulative: 80, 120, 240, 280, 360 — all fit
    const blockBottoms = [80, 120, 240, 280, 360];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBeNull();
  });
});

describe('findStraddlingSplitPos', () => {
  // Helper to build a mock doc with blocks of known sizes
  function mockDoc(blockNodeSizes: number[]) {
    return {
      resolve: (pos: number) => ({
        parent: { textContent: 'hello world foo bar baz qux' },
        parentOffset: 12, // points to the 'f' in 'foo'
        start: () => {
          // Compute the start of the block containing `pos`
          let accumulated = 0;
          for (const size of blockNodeSizes) {
            if (pos <= accumulated + size) return accumulated + 1; // +1 for open token
            accumulated += size;
          }
          return accumulated + 1;
        },
      }),
      child: (index: number) => ({ nodeSize: blockNodeSizes[index] }),
    };
  }

  it('returns splitPos and offset when a valid word boundary is found', () => {
    // 3 blocks: sizes 50, 80, 60. splitIdx = 1 (second block straddles).
    // posAtCoords returns pos=70 (inside block 1).
    // parentOffset=12, text="hello world foo bar baz qux"
    //   h(0)e(1)l(2)l(3)o(4) (5)w(6)o(7)r(8)l(9)d(10) (11)f(12)...
    // offset=12 → text[11]=' ' → wordBreak stays at 12 (already at boundary)
    // start() for block 1 = 50 + 1 = 51
    // splitPos = 51 + 12 = 63
    const doc = mockDoc([50, 80, 60]);
    const posAtCoords = () => ({ pos: 70 });

    const result = findStraddlingSplitPos(posAtCoords, doc, 1, 500, 400);

    expect(result).not.toBeNull();
    expect(result!.splitPos).toBe(63); // start(51) + wordBreak(12)
    expect(result!.withinBlockSplitOffset).toBe(12);
  });

  it('returns null when posAtCoords returns null', () => {
    const doc = mockDoc([50, 80, 60]);
    const posAtCoords = () => null;

    const result = findStraddlingSplitPos(posAtCoords, doc, 1, 500, 400);
    expect(result).toBeNull();
  });

  it('returns null when posAtCoords returns pos <= 2', () => {
    const doc = mockDoc([50, 80, 60]);
    const posAtCoords = () => ({ pos: 1 });

    const result = findStraddlingSplitPos(posAtCoords, doc, 1, 500, 400);
    expect(result).toBeNull();
  });

  it('returns null when split position is at or before the straddling block start (single tall line)', () => {
    // Block 0 size = 50, block 1 size = 80. splitIdx = 1.
    // Block 1 starts at position 50. Content starts at 51.
    // If posAtCoords returns pos = 51 (the very start of block 1),
    // the function should return null because even one line doesn't fit.
    const doc = {
      resolve: () => ({
        parent: { textContent: 'a' },
        parentOffset: 0,
        start: () => 51,
      }),
      child: (index: number) => ({ nodeSize: [50, 80][index] }),
    };
    const posAtCoords = () => ({ pos: 51 });

    const result = findStraddlingSplitPos(posAtCoords, doc, 1, 500, 400);
    expect(result).toBeNull();
  });

  it('falls back to posInfo.pos when no word boundary is found (single word)', () => {
    // text = "superlongword", parentOffset = 5, no spaces → wordBreak stays 0
    // splitPos = posInfo.pos (fallback), withinBlockSplitOffset = parentOffset
    const doc = {
      resolve: () => ({
        parent: { textContent: 'superlongword' },
        parentOffset: 5,
        start: () => 51,
      }),
      child: (index: number) => ({ nodeSize: [50, 80][index] }),
    };
    const posAtCoords = () => ({ pos: 60 });

    const result = findStraddlingSplitPos(posAtCoords, doc, 1, 500, 400);
    expect(result).not.toBeNull();
    expect(result!.splitPos).toBe(60); // falls back to posInfo.pos
    expect(result!.withinBlockSplitOffset).toBe(5); // parentOffset
  });

  it('works for list-like content (nested block with inline text)', () => {
    // A list is a single top-level block. When it straddles, posAtCoords
    // resolves to a position inside a listItem > paragraph. The parent
    // textContent and parentOffset come from that inner paragraph.
    const doc = {
      resolve: () => ({
        parent: { textContent: 'item three text here' },
        parentOffset: 11, // points to 't' in 'text'
        start: () => 101, // start of the inner paragraph
      }),
      child: (index: number) => ({ nodeSize: [50, 150][index] }),
    };
    const posAtCoords = () => ({ pos: 112 });

    const result = findStraddlingSplitPos(posAtCoords, doc, 1, 500, 400);
    expect(result).not.toBeNull();
    // wordBreak: offset=11, text[10]=' ' → wordBreak stays at 11
    // splitPos = 101 + 11 = 112
    expect(result!.splitPos).toBe(112);
    expect(result!.withinBlockSplitOffset).toBe(11);
  });

  it('handles splitIdx = 0 correctly (first block straddles)', () => {
    // Block 0 straddles. No blocks before it, so blockStart = 0.
    // posAtCoords returns pos = 20, which is > blockStart + 1 = 1.
    const doc = {
      resolve: () => ({
        parent: { textContent: 'hello world' },
        parentOffset: 8,
        start: () => 1,
      }),
      child: () => ({ nodeSize: 100 }),
    };
    const posAtCoords = () => ({ pos: 20 });

    const result = findStraddlingSplitPos(posAtCoords, doc, 0, 500, 400);
    expect(result).not.toBeNull();
    // wordBreak: offset=8, text="hello world", text[7]='o', ..., text[5]=' ' → wordBreak=6
    expect(result!.splitPos).toBe(7); // start(1) + wordBreak(6)
    expect(result!.withinBlockSplitOffset).toBe(6);
  });
});
