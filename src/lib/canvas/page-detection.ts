/** Minimal page rectangle for viewport detection (document-space coordinates) */
export interface PageRect {
  id: string;
  /** Top edge in document-space (scroll-relative) */
  top: number;
  /** Height of the page element */
  height: number;
}

/** Result of page detection: which page to target and the Y coordinate within it */
export interface PageDetectionResult {
  pageId: string;
  /** Y coordinate relative to the page (0 = top edge) */
  pageRelativeY: number;
}

/**
 * Find the page closest to a given viewport-center Y position.
 *
 * Primary path: exact intersection (viewport center falls within a page).
 * Fallback: pick the page whose center is closest to the viewport center.
 *
 * @param pages  Array of page rects in document-space (scroll-relative)
 * @param viewportCenterY  The viewport center Y in document-space (scrollTop + clientHeight/2)
 * @returns The matched page and the Y coordinate within it, or null if no pages
 */
export function findClosestPage(
  pages: PageRect[],
  viewportCenterY: number,
): PageDetectionResult | null {
  if (pages.length === 0) return null;

  // Primary: exact intersection
  for (const page of pages) {
    if (
      page.top <= viewportCenterY &&
      page.top + page.height >= viewportCenterY
    ) {
      return {
        pageId: page.id,
        pageRelativeY: viewportCenterY - page.top,
      };
    }
  }

  // Fallback: closest page center to viewport center
  let closest = pages[0];
  let minDist = Infinity;
  for (const page of pages) {
    const pageCenter = page.top + page.height / 2;
    const dist = Math.abs(pageCenter - viewportCenterY);
    if (dist < minDist) {
      minDist = dist;
      closest = page;
    }
  }

  // Clamp the relative Y to be within the page bounds
  const relY = Math.max(
    0,
    Math.min(closest.height, viewportCenterY - closest.top),
  );
  return {
    pageId: closest.id,
    pageRelativeY: relY,
  };
}

/** Result of cross-page boundary detection */
export interface CrossPageTarget {
  /** 0-based index of the target page */
  targetPageIndex: number;
  /** Adjusted Y coordinate on the target page */
  adjustedY: number;
}

/**
 * Detect if an object has crossed a page boundary after a drag displacement.
 *
 * @param objectY       Current Y position of the object (before displacement)
 * @param dy            Vertical displacement from drag
 * @param pageHeight    Height of a page (PAGE_HEIGHT)
 * @param currentPageIndex  0-based index of the object's current page
 * @param totalPages    Total number of pages in the document
 * @returns Target page and adjusted Y, or null if no boundary was crossed
 */
export function computeCrossPageTarget(
  objectY: number,
  dy: number,
  pageHeight: number,
  currentPageIndex: number,
  totalPages: number,
): CrossPageTarget | null {
  const newY = objectY + dy;

  if (newY > pageHeight) {
    // Crossed bottom boundary → next page
    // Allow moving past last page (signals new page creation)
    if (currentPageIndex >= totalPages - 1) {
      // Past last page — return totalPages as signal for new page creation
      return {
        targetPageIndex: totalPages,
        adjustedY: newY - pageHeight,
      };
    }
    return {
      targetPageIndex: currentPageIndex + 1,
      adjustedY: newY - pageHeight,
    };
  }

  if (newY < 0) {
    // Crossed top boundary → previous page
    if (currentPageIndex <= 0) {
      // Can't go above first page
      return null;
    }
    return {
      targetPageIndex: currentPageIndex - 1,
      adjustedY: newY + pageHeight,
    };
  }

  // No boundary crossed
  return null;
}
