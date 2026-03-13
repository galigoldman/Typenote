import type { jsPDF } from 'jspdf';

import type { CanvasPage } from '@/types/canvas';

import { renderBackground } from './background-renderer';
import { renderStroke } from './stroke-renderer';
import { renderTiptapContent } from './tiptap-to-pdf';

/** Canvas page width in points (matches A4 at 96 DPI) */
const PAGE_WIDTH = 794;

/** Canvas page height in points (matches A4 at 96 DPI) */
const PAGE_HEIGHT = 1123;

/**
 * Renders a single canvas page onto a jsPDF document.
 *
 * This is the top-level orchestrator for canvas-type pages during PDF export.
 * It delegates to specialised renderers for backgrounds, strokes, and text
 * boxes, assembling them in the correct visual order (background first, then
 * strokes, then text boxes on top).
 *
 * @param doc          - The jsPDF instance to render into
 * @param page         - The CanvasPage data (strokes, text boxes, page type)
 * @param canvasType   - The document-level canvas type, used as fallback when
 *                       the page does not specify its own pageType
 * @param isFirstPage  - When true, the renderer skips adding a new page
 *                       (the first page already exists in the document)
 */
export function renderCanvasPage(
  doc: jsPDF,
  page: CanvasPage,
  canvasType: string,
  isFirstPage: boolean,
): void {
  // Add a new page for every page after the first
  if (!isFirstPage) {
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  // Draw the background pattern (blank, lined, grid, or dotted)
  const pageType = page.pageType ?? canvasType;
  renderBackground(doc, pageType, PAGE_WIDTH, PAGE_HEIGHT);

  // Render strokes within page bounds.
  // Note: jsPDF's clip() leaves the path open, which merges with the first
  // stroke's fill and breaks rendering of subsequent strokes.  Instead we
  // save/restore around each individual stroke to isolate their paths.
  for (const stroke of page.strokes) {
    doc.saveGraphicsState();
    renderStroke(doc, stroke);
    doc.restoreGraphicsState();
  }

  // Render flow content (the main editable text area on the page)
  if (page.flowContent) {
    const fc = page.flowContent as { content?: unknown[] };
    if (fc.content && fc.content.length > 0) {
      // Match CSS: px-4 (16px) horizontal, pt-4/pt-8 vertical + font baseline offset
      const FLOW_PADDING_X = 16;
      const FLOW_PADDING_TOP = pageType === 'lined' ? 44 : 28;
      renderTiptapContent(
        doc,
        page.flowContent,
        FLOW_PADDING_X,
        FLOW_PADDING_TOP,
        PAGE_WIDTH - FLOW_PADDING_X * 2,
      );
    }
  }

  // Render text boxes, skipping any that are empty
  for (const textBox of page.textBoxes) {
    if (!textBox.content) continue;

    const content = textBox.content as { content?: unknown[] };
    if (!content.content || content.content.length === 0) continue;

    renderTiptapContent(
      doc,
      textBox.content,
      textBox.x,
      textBox.y,
      textBox.width,
    );
  }
}
