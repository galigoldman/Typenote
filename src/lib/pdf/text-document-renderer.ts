import type { jsPDF } from 'jspdf';

import { measureNodeHeight, renderTiptapContent, PX_TO_PT } from './tiptap-to-pdf';

// ---------------------------------------------------------------------------
// Page layout constants (A4 in points)
// ---------------------------------------------------------------------------

/** A4 page width in points */
const PAGE_WIDTH = 595.28;

/** A4 page height in points */
const PAGE_HEIGHT = 841.89;

/** 1-inch margin on all sides (72 pt = 1 inch) */
const MARGIN = 72;

/** Text area width after subtracting left + right margins */
const USABLE_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/** Text area height after subtracting top + bottom margins */
const USABLE_HEIGHT = PAGE_HEIGHT - 2 * MARGIN;

/**
 * If a heading would start in the bottom 15% of the usable area, push it to
 * the next page. This prevents "orphan" headings that sit alone at the bottom
 * of a page with no following body text.
 */
const ORPHAN_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Paginates and renders TipTap text content onto a jsPDF document.
 *
 * The caller is responsible for creating the jsPDF instance (with the first
 * page already present) and loading fonts. This function walks each top-level
 * node in the TipTap document, measures its height, inserts page breaks when
 * the content would overflow, and delegates the actual drawing to
 * `renderTiptapContent`.
 *
 * @param doc     - The jsPDF instance to render into (first page already added)
 * @param content - A TipTap JSON document (Record with `content` array)
 */
export function renderTextDocument(
  doc: jsPDF,
  content: Record<string, unknown>,
): void {
  const nodes = content.content as Record<string, unknown>[] | undefined;

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return;
  }

  /** Current y-position of the rendering cursor (pt from top of page) */
  let cursorY = MARGIN;

  /** Maximum y-position before content overflows the current page */
  const pageBottom = MARGIN + USABLE_HEIGHT;

  /** Y threshold below which headings are considered "orphaned" */
  const orphanLine = MARGIN + USABLE_HEIGHT * (1 - ORPHAN_THRESHOLD);

  for (const node of nodes) {
    const height = measureNodeHeight(doc, node, USABLE_WIDTH, PX_TO_PT);
    const nodeType = (node as { type?: string }).type;

    // --- Orphan heading prevention ---
    // If the node is a heading and the cursor is in the bottom 15% of the
    // usable area, push it to the next page even if it technically fits.
    if (nodeType === 'heading' && cursorY > orphanLine) {
      doc.addPage('a4');
      cursorY = MARGIN;
    }

    // --- Standard overflow check ---
    // If the node doesn't fit on the remaining space, start a new page.
    if (cursorY + height > pageBottom) {
      doc.addPage('a4');
      cursorY = MARGIN;
    }

    // Wrap the single node in a TipTap doc structure so renderTiptapContent
    // can process it. This lets us render one node at a time while tracking
    // pagination ourselves.
    const singleNodeDoc: Record<string, unknown> = {
      type: 'doc',
      content: [node],
    };

    renderTiptapContent(doc, singleNodeDoc, MARGIN, cursorY, USABLE_WIDTH, PX_TO_PT);

    cursorY += height;
  }
}
