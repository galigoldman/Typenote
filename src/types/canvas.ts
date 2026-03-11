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

/** A positioned text box on a page (created by cut/split operations) */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Record<string, unknown>;
}

/** A single A4 page in the document */
export interface CanvasPage {
  id: string;
  order: number;
  strokes: Stroke[];
  textBoxes: TextBox[];
  flowContent: Record<string, unknown> | null;
}

/** The complete canvas data for a document (stored in `pages` JSONB column) */
export interface CanvasDocument {
  pages: CanvasPage[];
}

/** A4 page dimensions in points (96 DPI) */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

export type CanvasTool = 'pen' | 'highlighter' | 'eraser' | 'text';

/** Current zoom and pan state (view-only, not persisted) */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}
