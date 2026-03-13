import { jsPDF } from 'jspdf';
import type { CanvasPage } from '@/types/canvas';
import { renderCanvasPage } from './canvas-page-renderer';
import { loadFonts } from './font-loader';
import { renderTextDocument } from './text-document-renderer';
import { sanitizeFilename } from './utils';

// Re-export a type for the document shape needed by this module
export interface ExportableDocument {
  title: string;
  content: Record<string, unknown>;
  pages: Record<string, unknown> | null;
  canvas_type: string;
}

export async function exportDocumentAsPdf(
  document: ExportableDocument,
): Promise<void> {
  // 1. Determine what content exists
  const hasCanvasPages =
    document.pages != null &&
    'pages' in document.pages &&
    Array.isArray((document.pages as Record<string, unknown>).pages) &&
    ((document.pages as Record<string, unknown>).pages as unknown[]).length > 0;
  const hasTextContent =
    document.content != null &&
    'content' in document.content &&
    Array.isArray((document.content as Record<string, unknown>).content) &&
    ((document.content as Record<string, unknown>).content as unknown[])
      .length > 0;

  // 2. Create jsPDF instance
  // For canvas pages: use custom size 794x1123 pts (matches the app's canvas dimensions)
  // For text-only: use A4 (595.28 x 841.89 pts)
  // For empty: use A4
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: hasCanvasPages ? [794, 1123] : 'a4',
  });

  // 3. Load fonts
  await loadFonts(doc);

  // 4. Route to appropriate renderer(s)
  // For mixed documents (both canvas pages AND text content), render canvas
  // pages first, then append text content as additional A4 pages.
  if (hasCanvasPages) {
    const canvasPages = (document.pages as { pages: CanvasPage[] }).pages;
    const sortedPages = [...canvasPages].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sortedPages.length; i++) {
      renderCanvasPage(doc, sortedPages[i], document.canvas_type, i === 0);
    }
  }

  if (hasTextContent) {
    if (hasCanvasPages) {
      // Mixed document: canvas pages already rendered, add a new A4 page
      // before starting text rendering (switches from canvas to A4 format)
      doc.addPage('a4');
    }
    renderTextDocument(doc, document.content);
  }
  // If neither: empty document -> already has one blank page from jsPDF constructor

  // 5. Generate filename and save
  // jsPDF.save() uses FileSaver.js internally which handles cross-platform
  // downloads including iOS Safari and Chrome.
  const filename = sanitizeFilename(document.title) + '.pdf';
  doc.save(filename);
}
