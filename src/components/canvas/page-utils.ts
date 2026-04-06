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
  // Any text box — even empty — counts as intentional content (T006)
  if (page.textBoxes.length > 0) return true;
  // PDF-backed pages are always considered content (T007)
  if (page.pdfPage !== undefined) return true;
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
