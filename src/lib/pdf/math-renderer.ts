import type { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import katex from 'katex';

/** Scale factor for the canvas rasterization fallback (2x for retina clarity). */
const RASTER_SCALE = 2;

/**
 * Renders a LaTeX math expression into the PDF at the specified position.
 *
 * Pipeline:
 * 1. Use KaTeX to render the LaTeX string into HTML markup.
 * 2. Insert the markup into a hidden DOM container so the browser lays it out.
 * 3. Wrap the rendered content in an SVG `<foreignObject>` element.
 * 4. Embed the SVG as vector content via svg2pdf.js's `doc.svg()`.
 * 5. If SVG embedding fails, fall back to rasterising the element onto a
 *    `<canvas>` at high DPI and embedding the resulting PNG via `doc.addImage`.
 * 6. Clean up all temporary DOM elements.
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
  // KaTeX HTML output relies on its own CSS for sizing. Set a reasonable
  // font-size so the measurement is representative of the PDF output.
  container.style.fontSize = '12pt';
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
    // while preserving aspect ratio.
    const scale = Math.min(
      maxWidth / renderedWidth,
      maxHeight / renderedHeight,
      1, // Never upscale
    );
    const finalWidth = renderedWidth * scale;
    const finalHeight = renderedHeight * scale;

    // --- Attempt 1: SVG vector embedding via svg2pdf.js -------------------
    try {
      const svgElement = buildForeignObjectSvg(container, renderedWidth, renderedHeight);
      document.body.appendChild(svgElement);

      try {
        await doc.svg(svgElement, {
          x,
          y,
          width: finalWidth,
          height: finalHeight,
        });
      } finally {
        document.body.removeChild(svgElement);
      }

      // Success — we are done.
      return;
    } catch {
      // svg2pdf.js could not handle the foreignObject SVG; continue to
      // the rasterisation fallback.
    }

    // --- Attempt 2: Canvas rasterisation fallback -------------------------
    try {
      await renderMathAsImage(doc, container, x, y, finalWidth, finalHeight);
    } catch {
      // Both approaches failed — fall back to plain text.
      renderMathAsText(doc, latex, x, y);
    }
  } finally {
    // Always clean up the measurement container.
    document.body.removeChild(container);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an SVG element that wraps HTML content via `<foreignObject>`.
 *
 * svg2pdf.js accepts an SVG DOM element. Since KaTeX produces HTML (not SVG),
 * we wrap it in `<foreignObject>` inside an `<svg>` so that the browser treats
 * the composite as a single SVG for embedding purposes.
 */
function buildForeignObjectSvg(
  htmlContainer: HTMLElement,
  width: number,
  height: number,
): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const xhtmlNS = 'http://www.w3.org/1999/xhtml';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('xmlns', svgNS);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.position = 'absolute';
  svg.style.left = '-9999px';
  svg.style.top = '-9999px';

  const foreignObject = document.createElementNS(svgNS, 'foreignObject');
  foreignObject.setAttribute('width', String(width));
  foreignObject.setAttribute('height', String(height));

  // Clone the rendered KaTeX HTML into the foreignObject with the correct
  // XHTML namespace so the SVG serialisation is valid.
  const body = document.createElementNS(xhtmlNS, 'div');
  body.innerHTML = htmlContainer.innerHTML;
  body.style.fontSize = htmlContainer.style.fontSize;
  foreignObject.appendChild(body);

  svg.appendChild(foreignObject);
  return svg;
}

/**
 * Rasterise an HTML element onto a `<canvas>` at {@link RASTER_SCALE}x
 * resolution and embed the resulting image into the PDF.
 *
 * This uses the browser's built-in SVG+foreignObject rendering path via
 * `drawImage` with a data-URI SVG, which avoids needing an extra library
 * like html2canvas.
 */
async function renderMathAsImage(
  doc: jsPDF,
  htmlContainer: HTMLElement,
  x: number,
  y: number,
  pdfWidth: number,
  pdfHeight: number,
): Promise<void> {
  const { width: srcWidth, height: srcHeight } =
    htmlContainer.getBoundingClientRect();

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(srcWidth * RASTER_SCALE);
  canvas.height = Math.ceil(srcHeight * RASTER_SCALE);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas 2d context');
  }

  // Build a data-URI SVG that wraps the KaTeX HTML via foreignObject.
  // The browser can paint this onto a canvas through `drawImage`.
  const svgData = buildSvgDataUri(htmlContainer, srcWidth, srcHeight);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.scale(RASTER_SCALE, RASTER_SCALE);
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to load math SVG image'));
    img.src = svgData;
  });

  const dataUrl = canvas.toDataURL('image/png');
  doc.addImage(dataUrl, 'PNG', x, y, pdfWidth, pdfHeight);
}

/**
 * Serialise an HTML element into a data-URI SVG string suitable for loading
 * into an `<img>` tag so the browser will rasterise it.
 */
function buildSvgDataUri(
  htmlContainer: HTMLElement,
  width: number,
  height: number,
): string {
  // Collect computed styles from the KaTeX stylesheet that are applied to
  // the rendered output. We inline them as a <style> block inside the SVG
  // so the image renders correctly even outside the document context.
  const styles = collectKatexStyles();

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    '<foreignObject width="100%" height="100%">',
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${htmlContainer.style.fontSize}">`,
    styles ? `<style>${styles}</style>` : '',
    htmlContainer.innerHTML,
    '</div>',
    '</foreignObject>',
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

/**
 * Attempt to extract KaTeX CSS rules from the document's stylesheets so they
 * can be inlined into a standalone SVG for rasterisation.
 *
 * Returns an empty string if no KaTeX styles are found (the fallback image
 * may look unstyled but will still be functional).
 */
function collectKatexStyles(): string {
  const rules: string[] = [];

  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.cssText.includes('katex')) {
            rules.push(rule.cssText);
          }
        }
      } catch {
        // Cross-origin stylesheets throw on cssRules access — skip them.
      }
    }
  } catch {
    // If styleSheets is unavailable, return empty.
  }

  return rules.join('\n');
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
  doc.setFont('GeistSans', 'italic');
  doc.setFontSize(12);
  doc.text(latex, x, y);
  doc.setFont(prevFont.fontName, prevFont.fontStyle);
}
