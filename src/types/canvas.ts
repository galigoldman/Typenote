/** A single pen input point: [x, y, pressure] */
export type StrokePoint = [x: number, y: number, pressure: number];

/** Axis-aligned bounding box for hit detection */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A single continuous pen stroke on a page */
export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  opacity: number;
  bbox: BBox;
  createdAt: number;
}

/** A positioned text box on a page */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Record<string, unknown> | null;
  isFullPage: boolean;
  zIndex: number;
  linkedNextId?: string;
  /** Font size multiplier (1 = default). Applied when resizing text boxes. */
  fontScale?: number;
  /** Measured tight bounds of rendered text content (transient, not persisted).
   *  offsetX = horizontal offset from text box origin (0 for LTR, positive for RTL).
   *  width = actual rendered content width (max across all lines). */
  contentBounds?: { offsetX: number; width: number };
}

/** A single A4 page in the document */
export interface CanvasPage {
  id: string;
  order: number;
  pageType?: 'blank' | 'lined' | 'grid' | 'dotted';
  strokes: Stroke[];
  textBoxes: TextBox[];
  flowContent: Record<string, unknown> | null;
  /** 0-indexed PDF page number for background rendering (material-backed documents only) */
  pdfPage?: number;
}

/** The complete canvas data for a document (stored in `pages` JSONB column) */
export interface CanvasDocument {
  pages: CanvasPage[];
}

/** A4 page dimensions in points (96 DPI) */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

export type CanvasTool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'select'
  | 'text'
  | 'read'
  | 'crop';

/** Current zoom and pan state (view-only, not persisted) */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** In-memory clipboard holding deep-cloned elements from a copy operation */
export interface ClipboardData {
  strokes: Stroke[];
  textBoxes: TextBox[];
  /** X center of the original selection bounding box */
  originX: number;
  /** Y center of the original selection bounding box */
  originY: number;
  /** Page ID where the copy was performed */
  sourcePageId: string;
}
