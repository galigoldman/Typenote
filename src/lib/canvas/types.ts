import type { Stroke } from '@/lib/drawing/types';

// Re-export drawing types used by canvas
export type { Stroke, Point, DrawingTool } from '@/lib/drawing/types';

/** Canvas background type — extends existing CanvasType with 'dotted' */
export type CanvasBackground = 'blank' | 'grid' | 'dotted' | 'lined';

/** Viewport state for pan/zoom */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4.0;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/** Base canvas element — all elements share these properties */
export interface CanvasElementBase {
  type: 'text-block' | 'drawing-layer';
  x: number;
  y: number;
  width: number;
  height: number;
  zOrder: number;
}

/** Text block: a positioned TipTap editor on the canvas */
export interface TextBlock extends CanvasElementBase {
  type: 'text-block';
  /** TipTap document JSON */
  content: Record<string, unknown>;
}

/** Drawing layer: a positioned canvas with freehand strokes */
export interface DrawingLayer extends CanvasElementBase {
  type: 'drawing-layer';
  strokes: Stroke[];
}

/** Union type for any canvas element */
export type CanvasElement = TextBlock | DrawingLayer;

/** Element map keyed by element ID for O(1) lookup */
export type ElementMap = Record<string, CanvasElement>;

/** Canvas document content format stored in documents.content JSONB */
export interface CanvasDocument {
  format: 'canvas';
  version: 1;
  viewport: Viewport;
  background: CanvasBackground;
  elements: ElementMap;
  /** Element IDs in bottom-to-top render order */
  zOrder: string[];
}

/** Type guard: is this content a canvas document? */
export function isCanvasDocument(
  content: Record<string, unknown>
): boolean {
  return content.format === 'canvas';
}

/** Default empty text block content (TipTap empty doc) */
export const EMPTY_TIPTAP_DOC: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** Create a new empty canvas document */
export function createCanvasDocument(
  background: CanvasBackground = 'blank'
): CanvasDocument {
  return {
    format: 'canvas',
    version: 1,
    viewport: { ...DEFAULT_VIEWPORT },
    background,
    elements: {},
    zOrder: [],
  };
}

/** Minimum element dimensions */
export const MIN_ELEMENT_WIDTH = 50;
export const MIN_ELEMENT_HEIGHT = 30;

/** Default text block dimensions */
export const DEFAULT_TEXT_BLOCK_WIDTH = 400;
export const DEFAULT_TEXT_BLOCK_HEIGHT = 200;
