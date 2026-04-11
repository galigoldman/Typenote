import type { CanvasPage } from '@/types/canvas';

/** Internal type used by canvas-editor (adds transient contentBounds to TextBox) */
type CanvasPageData = CanvasPage & {
  textBoxes: (CanvasPage['textBoxes'][number] & {
    contentBounds?: { offsetX: number; width: number };
  })[];
};

/** Returns true if a page has any real content (strokes, text boxes, PDF background, or typed text). */
export function pageHasContent(page: CanvasPageData): boolean {
  if (page.strokes.length > 0) return true;
  // PDF-backed pages are always considered content (T007)
  if (page.pdfPage !== undefined) return true;
  // User-positioned text boxes (non-ftb) count as intentional content.
  // The auto-created -ftb text box only counts if it has actual text
  // (otherwise every page would count as "has content" since all pages
  // now get an -ftb text box by default).
  for (const tb of page.textBoxes) {
    if (!tb.id.endsWith('-ftb')) return true; // user-positioned box
    // -ftb box: check if it has real text content
    if (tb.content && JSON.stringify(tb.content).includes('"text"'))
      return true;
  }
  if (!page.flowContent) return false;
  // An empty TipTap editor produces { type:'doc', content:[{type:'paragraph'}] }.
  // Real text contains a "text" key somewhere in the JSON.
  return JSON.stringify(page.flowContent).includes('"text"');
}

/**
 * Strip truly empty trailing pages from a pages array before saving.
 * Respects a floor (minimum page count) to prevent cross-device data loss.
 */
export function stripTrailingEmptyPages(
  pages: CanvasPageData[],
  floor: number,
): CanvasPageData[] {
  let lastContentIndex = pages.length - 1;
  while (lastContentIndex > 0 && !pageHasContent(pages[lastContentIndex])) {
    lastContentIndex--;
  }
  // Never strip below the floor (last-known database page count)
  const minIndex = Math.max(lastContentIndex, floor - 1);
  return pages.slice(0, minIndex + 1);
}
