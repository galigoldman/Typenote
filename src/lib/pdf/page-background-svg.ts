const GRID_SPACING = 32;
const LINE_COLOR = 'rgb(224,224,224)';
const LINE_WIDTH = 0.5;
const DOT_RADIUS = 1;

/**
 * Generate SVG elements for a canvas page background pattern.
 * Returns raw SVG element strings (no wrapping <svg> tag).
 * Returns empty string for 'blank' or unrecognised types.
 */
export function renderBackgroundSvg(
  pageType: string,
  width: number,
  height: number,
): string {
  switch (pageType) {
    case 'lined':
      return horizontalLines(width, height);
    case 'grid':
      return horizontalLines(width, height) + verticalLines(width, height);
    case 'dotted':
      return dots(width, height);
    case 'blank':
    default:
      return '';
  }
}

function horizontalLines(width: number, height: number): string {
  const lines: string[] = [];
  for (let y = GRID_SPACING; y < height; y += GRID_SPACING) {
    lines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${LINE_COLOR}" stroke-width="${LINE_WIDTH}"/>`,
    );
  }
  return lines.join('\n');
}

function verticalLines(width: number, height: number): string {
  const lines: string[] = [];
  for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${LINE_COLOR}" stroke-width="${LINE_WIDTH}"/>`,
    );
  }
  return lines.join('\n');
}

function dots(width: number, height: number): string {
  const circles: string[] = [];
  for (let y = GRID_SPACING; y < height; y += GRID_SPACING) {
    for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
      circles.push(
        `<circle cx="${x}" cy="${y}" r="${DOT_RADIUS}" fill="${LINE_COLOR}"/>`,
      );
    }
  }
  return circles.join('\n');
}
