import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBackground } from '../background-renderer';
import type { jsPDF } from 'jspdf';

function createMockDoc() {
  return {
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    circle: vi.fn(),
  } as unknown as jsPDF;
}

const WIDTH = 794;
const HEIGHT = 1123;
const GRID_SPACING = 32;

describe('renderBackground', () => {
  let doc: ReturnType<typeof createMockDoc>;

  beforeEach(() => {
    doc = createMockDoc();
  });

  it('blank background should only fill white rectangle', () => {
    renderBackground(doc, 'blank', WIDTH, HEIGHT);

    expect(doc.setFillColor).toHaveBeenCalledWith(255, 255, 255);
    expect(doc.rect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT, 'F');

    // No lines or circles should be drawn
    expect(doc.line).not.toHaveBeenCalled();
    expect(doc.circle).not.toHaveBeenCalled();
  });

  it('lined background should draw horizontal lines every 32px', () => {
    renderBackground(doc, 'lined', WIDTH, HEIGHT);

    // White fill is always applied first
    expect(doc.setFillColor).toHaveBeenCalledWith(255, 255, 255);
    expect(doc.rect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT, 'F');

    // Light gray color and line width for rules
    expect(doc.setDrawColor).toHaveBeenCalledWith(224, 224, 224);
    expect(doc.setLineWidth).toHaveBeenCalledWith(0.5);

    // Count expected horizontal lines: y = 32, 64, … while y < HEIGHT
    const expectedLineCount = Math.floor((HEIGHT - 1) / GRID_SPACING);
    expect(doc.line).toHaveBeenCalledTimes(expectedLineCount);

    // Verify the first and last line positions
    expect(doc.line).toHaveBeenCalledWith(0, GRID_SPACING, WIDTH, GRID_SPACING);
    const lastY = expectedLineCount * GRID_SPACING;
    expect(doc.line).toHaveBeenCalledWith(0, lastY, WIDTH, lastY);

    // No vertical lines or circles for lined pages
    expect(doc.circle).not.toHaveBeenCalled();
  });

  it('grid background should draw horizontal and vertical lines every 32px', () => {
    renderBackground(doc, 'grid', WIDTH, HEIGHT);

    // White fill
    expect(doc.setFillColor).toHaveBeenCalledWith(255, 255, 255);
    expect(doc.rect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT, 'F');

    // Gray color for lines
    expect(doc.setDrawColor).toHaveBeenCalledWith(224, 224, 224);
    expect(doc.setLineWidth).toHaveBeenCalledWith(0.5);

    const expectedHorizontalLines = Math.floor((HEIGHT - 1) / GRID_SPACING);
    const expectedVerticalLines = Math.floor((WIDTH - 1) / GRID_SPACING);
    const totalLines = expectedHorizontalLines + expectedVerticalLines;

    expect(doc.line).toHaveBeenCalledTimes(totalLines);

    // Verify a horizontal line
    expect(doc.line).toHaveBeenCalledWith(0, GRID_SPACING, WIDTH, GRID_SPACING);

    // Verify a vertical line
    expect(doc.line).toHaveBeenCalledWith(GRID_SPACING, 0, GRID_SPACING, HEIGHT);

    // No circles for grid pages
    expect(doc.circle).not.toHaveBeenCalled();
  });

  it('dotted background should draw circles at 32px intersections', () => {
    renderBackground(doc, 'dotted', WIDTH, HEIGHT);

    // White fill
    expect(doc.setFillColor).toHaveBeenCalledWith(255, 255, 255);
    expect(doc.rect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT, 'F');

    // Gray fill color for dots
    expect(doc.setFillColor).toHaveBeenCalledWith(224, 224, 224);

    // Count expected dots: intersections where x = 32,64,… < WIDTH and y = 32,64,… < HEIGHT
    const dotsPerRow = Math.floor((WIDTH - 1) / GRID_SPACING);
    const dotsPerCol = Math.floor((HEIGHT - 1) / GRID_SPACING);
    const expectedDotCount = dotsPerRow * dotsPerCol;

    expect(doc.circle).toHaveBeenCalledTimes(expectedDotCount);

    // Verify the first dot (top-left intersection)
    expect(doc.circle).toHaveBeenCalledWith(GRID_SPACING, GRID_SPACING, 1, 'F');

    // No lines should be drawn for dotted pages
    expect(doc.line).not.toHaveBeenCalled();
  });

  it('should use correct page dimensions', () => {
    renderBackground(doc, 'grid', WIDTH, HEIGHT);

    // White fill covers the entire page
    expect(doc.rect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT, 'F');

    // All horizontal lines should span the full width (0 to WIDTH)
    const lineCalls = (doc.line as ReturnType<typeof vi.fn>).mock.calls;

    // Check horizontal lines: start x=0, end x=WIDTH, and y within bounds
    const horizontalLines = lineCalls.filter(
      ([x1, , x2]: number[]) => x1 === 0 && x2 === WIDTH,
    );
    for (const [, y1, , y2] of horizontalLines) {
      expect(y1).toBe(y2); // horizontal line has same y
      expect(y1).toBeGreaterThan(0);
      expect(y1).toBeLessThan(HEIGHT);
    }

    // Check vertical lines: start y=0, end y=HEIGHT, and x within bounds
    const verticalLines = lineCalls.filter(
      ([, y1, , y2]: number[]) => y1 === 0 && y2 === HEIGHT,
    );
    for (const [x1, , x2] of verticalLines) {
      expect(x1).toBe(x2); // vertical line has same x
      expect(x1).toBeGreaterThan(0);
      expect(x1).toBeLessThan(WIDTH);
    }
  });
});
