import type { jsPDF } from 'jspdf';
import katex from 'katex';

/**
 * Renders a LaTeX math expression into the PDF at the specified position.
 *
 * Strategy: Use KaTeX to render HTML in a hidden DOM element, then walk the
 * rendered DOM tree and draw each visible text fragment directly with jsPDF
 * text primitives. This avoids canvas/image-based approaches that fail due
 * to browser "tainted canvas" security restrictions on cross-origin fonts.
 *
 * The output is vector text (not rasterised) positioned according to KaTeX's
 * CSS layout, producing properly typeset math formulas in the PDF.
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
    renderMathAsText(doc, latex, x, y + 12);
    return;
  }

  // Create a hidden container and let the browser layout the KaTeX HTML.
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.fontSize = '16px';
  container.style.lineHeight = 'normal';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const containerRect = container.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
      renderMathAsText(doc, latex, x, y + 12);
      return;
    }

    // Scale to fit within the caller's bounding box.
    const scale = Math.min(
      maxWidth / containerRect.width,
      maxHeight / containerRect.height,
      1,
    );

    // Walk the DOM and collect all visible text fragments with their positions.
    const fragments = collectTextFragments(container, containerRect);

    // Draw each text fragment as vector text in the PDF.
    const prevFont = doc.getFont();
    const prevSize = doc.getFontSize();

    for (const frag of fragments) {
      const pdfX = x + frag.relX * scale;
      // Offset y by the fragment's baseline position
      const pdfY = y + frag.relY * scale;
      const pdfSize = frag.fontSize * scale;

      // Select appropriate font style
      if (frag.isItalic) {
        doc.setFont('GeistSans', 'italic');
      } else if (frag.isBold) {
        doc.setFont('GeistSans', 'bold');
      } else {
        doc.setFont('GeistSans', 'normal');
      }
      doc.setFontSize(pdfSize);
      doc.setTextColor(0, 0, 0);

      doc.text(frag.text, pdfX, pdfY);
    }

    // Restore previous font state
    doc.setFont(prevFont.fontName, prevFont.fontStyle);
    doc.setFontSize(prevSize);
  } finally {
    document.body.removeChild(container);
  }
}

/** A positioned text fragment extracted from the KaTeX DOM. */
interface TextFragment {
  text: string;
  /** X offset relative to container left */
  relX: number;
  /** Y offset relative to container top (at text baseline) */
  relY: number;
  fontSize: number;
  isItalic: boolean;
  isBold: boolean;
}

/**
 * Walk the KaTeX DOM tree and collect all visible text nodes with their
 * positions relative to the container.
 */
function collectTextFragments(
  container: HTMLElement,
  containerRect: DOMRect,
): TextFragment[] {
  const fragments: TextFragment[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_REJECT;

      // Skip nodes inside annotation elements (screen-reader only)
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.tagName === 'ANNOTATION') return NodeFilter.FILTER_REJECT;

      // Skip elements hidden via aria-hidden or display:none
      const computedStyle = window.getComputedStyle(parent);
      if (computedStyle.display === 'none') return NodeFilter.FILTER_REJECT;
      if (computedStyle.visibility === 'hidden')
        return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    if (!text.trim()) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    // Get the range rect for precise text positioning
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    if (rects.length === 0) continue;

    const rect = rects[0];
    const computedStyle = window.getComputedStyle(parent);
    const fontSize = parseFloat(computedStyle.fontSize) || 16;
    const fontStyle = computedStyle.fontStyle;
    const fontWeight = computedStyle.fontWeight;

    fragments.push({
      text: text,
      relX: rect.left - containerRect.left,
      // Position at baseline: top + fontSize * ~0.8 (approximate baseline)
      relY: rect.top - containerRect.top + fontSize * 0.8,
      fontSize,
      isItalic: fontStyle === 'italic',
      isBold: fontWeight === 'bold' || parseInt(fontWeight) >= 700,
    });
  }

  return fragments;
}

/**
 * Last-resort fallback: render the raw LaTeX string as monospace text.
 */
function renderMathAsText(
  doc: jsPDF,
  latex: string,
  x: number,
  y: number,
): void {
  const prevFont = doc.getFont();
  const prevSize = doc.getFontSize();
  doc.setFont('GeistMono', 'normal');
  doc.setFontSize(12);
  doc.text(latex, x, y);
  doc.setFont(prevFont.fontName, prevFont.fontStyle);
  doc.setFontSize(prevSize);
}
