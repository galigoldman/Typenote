import type { jsPDF } from 'jspdf';
import katex from 'katex';

/** Dimensions returned by renderMath so the caller can advance its cursor. */
export interface MathDimensions {
  width: number;
  height: number;
}

/** DPI multiplier for crisp rasterised math. */
const PIXEL_RATIO = 3;

/**
 * Renders a LaTeX math expression into the PDF at the specified position.
 *
 * Pipeline:
 * 1. KaTeX renders LaTeX to HTML
 * 2. Browser lays out the HTML (offscreen div)
 * 3. html-to-image rasterises the div to PNG at high DPI
 * 4. PNG is embedded in the PDF via doc.addImage
 * 5. On failure, falls back to rendering the visual text extracted from KaTeX HTML
 */
export async function renderMath(
  doc: jsPDF,
  latex: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Promise<MathDimensions> {
  // Step 1: Render LaTeX to HTML via KaTeX
  let html: string;
  try {
    html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  } catch {
    return renderMathFallback(doc, latex, x, y);
  }

  // Step 2: Create container, insert KaTeX HTML, let browser lay it out.
  // Use position:fixed so the element is on-screen (required for html-to-image)
  // but visually hidden via opacity:0.
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:0;top:0;z-index:-9999;opacity:0;pointer-events:none;' +
    'font-size:16px;line-height:normal;background:white;display:inline-block;';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // Force layout
    void container.offsetHeight;

    const rect = container.getBoundingClientRect();
    const renderedWidth = rect.width;
    const renderedHeight = rect.height;

    if (renderedWidth < 1 || renderedHeight < 1) {
      return renderMathFallback(doc, latex, x, y, container);
    }

    // Scale to fit within bounding box
    const scale = Math.min(
      maxWidth / renderedWidth,
      maxHeight / renderedHeight,
      1,
    );
    const finalWidth = renderedWidth * scale;
    const finalHeight = renderedHeight * scale;

    // Step 3: Try to rasterise with html-to-image
    try {
      const { toPng } = await import('html-to-image');

      // Make temporarily visible for capture
      container.style.opacity = '1';
      container.style.zIndex = '999999';

      const options = {
        pixelRatio: PIXEL_RATIO,
        backgroundColor: '#ffffff',
        width: Math.ceil(renderedWidth) + 2,
        height: Math.ceil(renderedHeight) + 2,
      };

      // Double-call: first warms font cache, second captures correctly
      await toPng(container, options).catch(() => null);
      const dataUrl = await toPng(container, options);

      // Hide again
      container.style.opacity = '0';
      container.style.zIndex = '-9999';

      if (dataUrl && dataUrl.length > 100) {
        doc.addImage(dataUrl, 'PNG', x, y, finalWidth, finalHeight);
        return { width: finalWidth, height: finalHeight };
      }

      return renderMathFallback(doc, latex, x, y, container);
    } catch (err) {
      console.warn('[math-renderer] html-to-image failed:', err);
      return renderMathFallback(doc, latex, x, y, container);
    }
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
}

/** No-op kept for API compatibility. */
export function resetMathRendererCache(): void {}

// ---------------------------------------------------------------------------
// Fallback: extract visual text from KaTeX HTML and render as jsPDF text
// ---------------------------------------------------------------------------

/**
 * Fallback renderer: extracts the visual text content from KaTeX's HTML
 * and renders it as styled text. More readable than raw LaTeX.
 */
function renderMathFallback(
  doc: jsPDF,
  latex: string,
  x: number,
  y: number,
  container?: HTMLElement,
): MathDimensions {
  let displayText = latex;
  if (container) {
    const visualText = container.textContent?.trim();
    if (visualText && visualText.length > 0) {
      displayText = visualText;
    }
  }

  const prevFont = doc.getFont();
  const prevSize = doc.getFontSize();
  doc.setFont('GeistSans', 'italic');
  doc.setFontSize(prevSize * 0.9);
  const dims = doc.getTextDimensions(displayText);
  doc.text(displayText, x, y + prevSize * 0.75);
  doc.setFont(prevFont.fontName, prevFont.fontStyle);
  doc.setFontSize(prevSize);
  return { width: dims.w, height: dims.h };
}
