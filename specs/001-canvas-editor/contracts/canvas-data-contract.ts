/**
 * Canvas Data Contract
 *
 * TypeScript interfaces defining the shape of canvas document data
 * stored in the `pages` JSONB column of the `documents` table.
 *
 * These types are the contract between:
 * - Client-side canvas rendering (reads/writes this data)
 * - Server actions (persists this data to Supabase)
 * - Realtime sync (transmits this data between devices)
 */

// -- Point & Geometry --

/** A single pen input point: [x, y, pressure] */
export type StrokePoint = [x: number, y: number, pressure: number];

/** Axis-aligned bounding box for hit detection */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// -- Canvas Objects --

/** A single continuous pen stroke on a page */
export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string; // hex, e.g. "#000000"
  width: number; // stroke width in page points
  bbox: BBox; // precomputed for eraser hit detection
  createdAt: number; // epoch milliseconds
}

/** A positioned text box on a page (created by cut/split operations) */
export interface TextBox {
  id: string;
  x: number; // left position in page coordinates
  y: number; // top position in page coordinates
  width: number;
  height: number;
  content: Record<string, unknown>; // TipTap/ProseMirror JSON
}

// -- Page --

/** A single A4 page in the document */
export interface CanvasPage {
  id: string;
  order: number; // display sequence, 0-based
  strokes: Stroke[];
  textBoxes: TextBox[];
  flowContent: Record<string, unknown>; // TipTap JSON for default flowing text
}

// -- Document --

/** The complete canvas data for a document (stored in `pages` JSONB column) */
export interface CanvasDocument {
  pages: CanvasPage[];
}

// -- Page Constants --

/** A4 page dimensions in points (96 DPI) */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const PAGE_ASPECT_RATIO = 210 / 297; // A4 width/height ratio

// -- Tool Types --

export type CanvasTool = 'pen' | 'eraser' | 'selection';

// -- View Transform --

/** Current zoom and pan state (view-only, not persisted) */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}
