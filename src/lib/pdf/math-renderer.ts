import type { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import katex from 'katex';

/** DPI scale for high-quality rasterisation of math formulas. */
const RASTER_SCALE = 2;

/**
 * Renders a LaTeX math expression into the PDF at the specified position.
 *
 * Pipeline:
 * 1. Use KaTeX to render the LaTeX string into HTML markup.
 * 2. Insert the markup into a hidden DOM container so the browser lays it out.
 * 3. Measure the rendered dimensions via getBoundingClientRect().
 * 4. Rasterise the container to a PNG via html-to-image (handles CSS styling
 *    and font embedding automatically — no fragile foreignObject workarounds).
 * 5. Embed the PNG into the PDF via doc.addImage().
 * 6. If rasterisation fails, fall back to rendering the raw LaTeX string as text.
 * 7. Clean up all temporary DOM elements.
 */
export async function renderMath(
  doc: jsPDF,
  latex: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Promise<void> {
  // Render LaTeX to HTML via KaTeX
  let html: string;
  try {
    html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  } catch {
    // KaTeX itself failed — fall back to plain text immediately
    renderMathAsText(doc, latex, x, y);
    return;
  }

  // Create a hidden container, insert the KaTeX HTML, and let the browser
  // perform layout so we can measure the rendered dimensions.
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.fontSize = '16pt';
  container.style.lineHeight = '1';
  // Prevent the container from being invisible to html-to-image
  container.style.backgroundColor = 'white';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const { width: renderedWidth, height: renderedHeight } =
      container.getBoundingClientRect();

    // Guard against zero-dimension elements (e.g. empty LaTeX string).
    if (renderedWidth === 0 || renderedHeight === 0) {
      renderMathAsText(doc, latex, x, y);
      return;
    }

    // Scale the rendered element so it fits within the caller's bounding box
    // while preserving aspect ratio. Never upscale.
    const scale = Math.min(
      maxWidth / renderedWidth,
      maxHeight / renderedHeight,
      1,
    );
    const finalWidth = renderedWidth * scale;
    const finalHeight = renderedHeight * scale;

    // Rasterise the KaTeX HTML to PNG using html-to-image.
    // This library handles CSS, fonts, and styling correctly without
    // relying on foreignObject SVGs (which browsers block for security).
    try {
      const dataUrl = await toPng(container, {
        pixelRatio: RASTER_SCALE,
        backgroundColor: 'white',
      });

      doc.addImage(dataUrl, 'PNG', x, y, finalWidth, finalHeight);
      return;
    } catch {
      // html-to-image failed — fall back to plain text
      renderMathAsText(doc, latex, x, y + finalHeight * 0.7);
    }
  } finally {
    // Always clean up the measurement container.
    document.body.removeChild(container);
  }
}

/**
 * Last-resort fallback: render the raw LaTeX string as italic text in the PDF.
 */
function renderMathAsText(
  doc: jsPDF,
  latex: string,
  x: number,
  y: number,
): void {
  const prevFont = doc.getFont();
  doc.setFont('GeistMono', 'normal');
  doc.setFontSize(12);
  doc.text(latex, x, y);
  doc.setFont(prevFont.fontName, prevFont.fontStyle);
}
