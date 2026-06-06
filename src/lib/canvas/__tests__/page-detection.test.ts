import { describe, it, expect } from 'vitest';
import {
  findClosestPage,
  computeCrossPageTarget,
  type PageRect,
} from '../page-detection';
import { PAGE_HEIGHT } from '@/types/canvas';

describe('findClosestPage', () => {
  // Helper to create page rects with consistent spacing
  const makePages = (count: number, pageHeight = 1123, gap = 20): PageRect[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `page-${i}`,
      top: i * (pageHeight + gap),
      height: pageHeight,
    }));

  it('returns the page when viewport center is exactly on page 3', () => {
    const pages = makePages(5);
    // Page 2 (0-indexed) starts at 2 * (1123 + 20) = 2286, ends at 3409
    const viewportCenterY = 2286 + 500; // middle of page 3 (index 2)
    const result = findClosestPage(pages, viewportCenterY);
    expect(result).toEqual({
      pageId: 'page-2',
      pageRelativeY: 500,
    });
  });

  it('returns nearest page when viewport center is in gap between page 2 and 3', () => {
    const pages = makePages(5);
    // Gap between page 1 (ends at 1123+1143=2266) and page 2 (starts at 2286)
    // Page 1 ends at 1 * (1123+20) + 1123 - 1 = 2265
    // Page 2 starts at 2 * (1123+20) = 2286
    const gapCenter = (2266 + 2286) / 2; // middle of gap
    const result = findClosestPage(pages, gapCenter);
    expect(result).not.toBeNull();
    // Should pick the closest page (page 1 or page 2)
    expect(['page-1', 'page-2']).toContain(result!.pageId);
  });

  it('returns last page when viewport center is past last page', () => {
    const pages = makePages(3);
    const pastEnd = 3 * (1123 + 20) + 500; // way past the last page
    const result = findClosestPage(pages, pastEnd);
    expect(result).not.toBeNull();
    expect(result!.pageId).toBe('page-2');
  });

  it('returns the only page in a single-page document', () => {
    const pages = makePages(1);
    const result = findClosestPage(pages, 500);
    expect(result).toEqual({
      pageId: 'page-0',
      pageRelativeY: 500,
    });
  });

  it('returns first page when viewport center is above first page', () => {
    const pages = makePages(3);
    // Pages start at top=0, so negative viewport center is above
    const result = findClosestPage(pages, -100);
    expect(result).not.toBeNull();
    expect(result!.pageId).toBe('page-0');
    expect(result!.pageRelativeY).toBe(0); // clamped to 0
  });

  it('returns null when no pages exist', () => {
    const result = findClosestPage([], 500);
    expect(result).toBeNull();
  });
});

describe('computeCrossPageTarget', () => {
  it('detects crossing bottom boundary to next page', () => {
    // Object at Y=1100, dragged dy=50 → newY=1150 > PAGE_HEIGHT(1123)
    const result = computeCrossPageTarget(1100, 50, PAGE_HEIGHT, 1, 5);
    expect(result).not.toBeNull();
    expect(result!.targetPageIndex).toBe(2);
    expect(result!.adjustedY).toBe(1150 - PAGE_HEIGHT); // 27
  });

  it('detects crossing top boundary to previous page', () => {
    // Object at Y=20, dragged dy=-30 → newY=-10 < 0
    const result = computeCrossPageTarget(20, -30, PAGE_HEIGHT, 2, 5);
    expect(result).not.toBeNull();
    expect(result!.targetPageIndex).toBe(1);
    expect(result!.adjustedY).toBe(-10 + PAGE_HEIGHT); // 1113
  });

  it('returns null when no boundary is crossed', () => {
    // Object at Y=500, dragged dy=10 → newY=510, within page
    const result = computeCrossPageTarget(500, 10, PAGE_HEIGHT, 1, 5);
    expect(result).toBeNull();
  });

  it('returns null when trying to go above first page', () => {
    // Object at Y=20, dragged dy=-50 → newY=-30 < 0, but on first page
    const result = computeCrossPageTarget(20, -50, PAGE_HEIGHT, 0, 5);
    expect(result).toBeNull();
  });

  it('signals new page creation when dragging past last page', () => {
    // Object at Y=1100, dragged dy=50 on last page (index 4, total 5)
    const result = computeCrossPageTarget(1100, 50, PAGE_HEIGHT, 4, 5);
    expect(result).not.toBeNull();
    expect(result!.targetPageIndex).toBe(5); // equals totalPages → new page
    expect(result!.adjustedY).toBe(1150 - PAGE_HEIGHT);
  });
});
