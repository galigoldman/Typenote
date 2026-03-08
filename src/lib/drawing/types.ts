/** A single sampled point: [x, y, pressure] */
export type Point = [x: number, y: number, pressure: number];

export type DrawingTool = 'pen' | 'eraser';

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: DrawingTool;
}

export type DrawingBackground = 'transparent' | 'lined' | 'grid';

export interface DrawingBlockAttrs {
  id: string;
  width: number;
  height: number;
  background: DrawingBackground;
  strokes: Stroke[];
}

export interface ToolSettings {
  tool: DrawingTool;
  color: string;
  width: number;
}

export const DEFAULT_COLORS = ['#000000', '#2563eb', '#dc2626'] as const;
export const DEFAULT_WIDTHS = [1, 2, 4] as const;

export const DEFAULT_DRAWING_BLOCK_ATTRS: Omit<DrawingBlockAttrs, 'id'> = {
  width: 800,
  height: 400,
  background: 'transparent',
  strokes: [],
};
