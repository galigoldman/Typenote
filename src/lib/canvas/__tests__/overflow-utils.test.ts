import { describe, it, expect } from 'vitest';
import { findOverflowSplitIndex } from '../text-split';

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
