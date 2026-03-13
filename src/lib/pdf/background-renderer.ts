import type { jsPDF } from 'jspdf';

const GRID_SPACING = 32;
const LINE_WIDTH = 0.5;
const LIGHT_GRAY = { r: 224, g: 224, b: 224 };
const DOT_RADIUS = 1;

/**
 * Fill the page with a solid white background.
 * Every page type starts with this base layer.
 */
function fillWhite(doc: jsPDF, width: number, height: number): void {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, 'F');
}

/**
 * Draw horizontal lines spaced every {@link GRID_SPACING} points.
 */
function drawHorizontalLines(doc: jsPDF, width: number, height: number): void {
  doc.setDrawColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
  doc.setLineWidth(LINE_WIDTH);

  for (let y = GRID_SPACING; y < height; y += GRID_SPACING) {
    doc.line(0, y, width, y);
  }
}

/**
 * Draw vertical lines spaced every {@link GRID_SPACING} points.
 */
function drawVerticalLines(doc: jsPDF, width: number, height: number): void {
  doc.setDrawColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
  doc.setLineWidth(LINE_WIDTH);

  for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
    doc.line(x, 0, x, height);
  }
}

/**
 * Draw small filled circles at every grid intersection point.
 */
function drawDots(doc: jsPDF, width: number, height: number): void {
  doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);

  for (let y = GRID_SPACING; y < height; y += GRID_SPACING) {
    for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
      doc.circle(x, y, DOT_RADIUS, 'F');
    }
  }
}

/**
 * Render the background pattern for a given page type onto a jsPDF document.
 *
 * Supported page types:
 * - `blank`  — solid white fill only
 * - `lined`  — white fill + horizontal rules every 32 pt
 * - `grid`   — white fill + horizontal & vertical rules every 32 pt
 * - `dotted` — white fill + small dots at every 32 pt intersection
 *
 * Any unrecognised page type falls back to `blank`.
 */
export function renderBackground(
  doc: jsPDF,
  pageType: string,
  width: number,
  height: number,
): void {
  fillWhite(doc, width, height);

  switch (pageType) {
    case 'lined':
      drawHorizontalLines(doc, width, height);
      break;
    case 'grid':
      drawHorizontalLines(doc, width, height);
      drawVerticalLines(doc, width, height);
      break;
    case 'dotted':
      drawDots(doc, width, height);
      break;
    case 'blank':
    default:
      // White fill already applied — nothing else to draw.
      break;
  }
}
