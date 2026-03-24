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

  it('returns 1 (not 0) when the first block itself overflows', () => {
    // Single block that exceeds the page — clamp to 1 so the page is not left empty
    const blockBottoms = [1500];
    expect(findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)).toBe(1);
  });

  it('clamps to 1 when block 0 overflows in a multi-block doc', () => {
    // First block is already past page height
    const blockBottoms = [1200, 1500, 1800];
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
