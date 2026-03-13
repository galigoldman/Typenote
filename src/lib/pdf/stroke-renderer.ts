import { getStroke } from 'perfect-freehand';

import type { Stroke } from '@/types/canvas';
import type { jsPDF } from 'jspdf';

/**
 * Parses a hex color string (e.g. '#ff00aa' or '#000') into RGB components.
 * Returns { r: 0, g: 0, b: 0 } for invalid input.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');

  let r = 0,
    g = 0,
    b = 0;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.substring(0, 2), 16);
    g = parseInt(cleaned.substring(2, 4), 16);
    b = parseInt(cleaned.substring(4, 6), 16);
  }

  return { r, g, b };
}

/**
 * Renders a canvas Stroke onto a jsPDF document as a filled vector path.
 *
 * Uses perfect-freehand's getStroke to compute the outline polygon from the
 * stroke's input points, then draws that polygon using jsPDF's path primitives
 * (moveTo / lineTo / closePath / fill).
 *
 * When the stroke has opacity < 1, a PDF graphics state is used to apply
 * transparency. The graphics state is saved beforehand and restored afterwards
 * so it does not affect subsequent drawing operations.
 */
export function renderStroke(doc: jsPDF, stroke: Stroke): void {
  // Compute the outline polygon using perfect-freehand
  const outline = getStroke(stroke.points, {
    size: stroke.width,
    simulatePressure: false,
  });

  // Need at least 3 points to form a closed polygon
  if (outline.length < 3) return;

  // Parse the stroke color from hex to RGB
  const { r, g, b } = hexToRgb(stroke.color);

  // Apply opacity via PDF graphics state if needed
  const needsOpacity = stroke.opacity < 1;
  if (needsOpacity) {
    doc.saveGraphicsState();
    // jsPDF exposes GState as a constructor on the instance
    const GState = (
      doc as unknown as { GState: new (opts: { opacity: number }) => unknown }
    ).GState;
    doc.setGState(new GState({ opacity: stroke.opacity }));
  }

  // Set fill color
  doc.setFillColor(r, g, b);

  // Draw the outline polygon
  doc.moveTo(outline[0][0], outline[0][1]);

  for (let i = 1; i < outline.length; i++) {
    doc.lineTo(outline[i][0], outline[i][1]);
  }

  doc.close();
  doc.fill();

  // Restore graphics state if we modified it
  if (needsOpacity) {
    doc.restoreGraphicsState();
  }
}
