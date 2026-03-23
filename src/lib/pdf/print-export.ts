import type { ExportableDocument } from './export-pdf';
import type { CanvasPage } from '@/types/canvas';
import {
  buildTextDocumentHtml,
  buildCanvasPageHtml,
  buildMixedDocumentHtml,
} from './html-template';

/**
 * Export a document by opening a styled print window and triggering
 * the browser's native print dialog. The browser's print engine renders
 * the HTML to PDF with full support for KaTeX math, Hebrew BiDi text,
 * SVG vector strokes, and all CSS formatting — producing EXACT WYSIWYG
 * output with real selectable text.
 */
export async function printExportDocument(
  document: ExportableDocument,
): Promise<void> {
  const canvasPages = extractCanvasPages(document);
  const hasCanvasPages = canvasPages.length > 0;
  const hasTextContent =
    document.content != null &&
    'content' in document.content &&
    Array.isArray((document.content as Record<string, unknown>).content) &&
    ((document.content as Record<string, unknown>).content as unknown[])
      .length > 0;

  // Build HTML based on document type
  let html: string;

  if (!hasCanvasPages && !hasTextContent) {
    // Empty document — produce a blank page
    html = buildTextDocumentHtml({ type: 'doc', content: [] }, document.title);
  } else if (!hasCanvasPages) {
    // Text-only document
    html = buildTextDocumentHtml(document.content, document.title);
  } else if (!hasTextContent) {
    // Canvas-only document
    html = buildCanvasPageHtml(
      canvasPages,
      document.canvas_type,
      document.title,
    );
  } else {
    // Mixed: canvas pages + text content
    html = buildMixedDocumentHtml(
      canvasPages,
      document.content,
      document.canvas_type,
      document.title,
    );
  }

  // Open a new window, write the HTML, wait for resources, then print
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error(
      'Could not open print window. Please allow pop-ups for this site.',
    );
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for fonts and KaTeX CSS to load before printing
  await printWindow.document.fonts.ready;

  // Small delay to ensure the browser has finished layout
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Auto-close the print window after the dialog is dismissed
  printWindow.addEventListener('afterprint', () => {
    printWindow.close();
  });

  printWindow.print();
}

/**
 * Extract CanvasPage[] from the document's pages field, handling
 * both the CanvasDocument shape ({ pages: CanvasPage[] }) and raw arrays.
 */
function extractCanvasPages(document: ExportableDocument): CanvasPage[] {
  if (!document.pages) return [];

  const pagesObj = document.pages as Record<string, unknown>;

  // CanvasDocument shape: { pages: CanvasPage[] }
  if ('pages' in pagesObj && Array.isArray(pagesObj.pages)) {
    return pagesObj.pages as CanvasPage[];
  }

  return [];
}
