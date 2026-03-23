'use client';

import type { BBox } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';

interface SelectionOverlayProps {
  /** Points of the lasso/rect being drawn, null when not drawing */
  selectionPath: [number, number][] | null;
  /** Whether selection mode is rectangle (true) or freeform lasso (false) */
  isRectMode: boolean;
  /** Container-based bounding box (used for resize handles), null when nothing selected */
  selectionBBox: BBox | null;
  /** Tight content-based bounding box (used for selection highlight), null when nothing selected */
  tightSelectionBBox?: BBox | null;
  /** Whether currently dragging selected objects */
  isDragging: boolean;
  /** Current drag offset */
  dragOffset: { x: number; y: number };
  /** Whether currently resizing selected objects */
  isResizing: boolean;
  /** Live bounding box during resize, null when not resizing */
  resizeBBox: BBox | null;
}

const HANDLE_SIZE = 6;
const HALF_HANDLE = HANDLE_SIZE / 2;

function SelectionPath({
  points,
  isRectMode,
}: {
  points: [number, number][];
  isRectMode: boolean;
}) {
  if (points.length === 0) return null;

  const sharedStyle = {
    fill: 'rgba(59, 130, 246, 0.1)',
    stroke: '#3b82f6',
    strokeDasharray: '4 2',
    strokeWidth: 1,
  };

  if (isRectMode) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return (
      <rect
        x={minX}
        y={minY}
        width={maxX - minX}
        height={maxY - minY}
        {...sharedStyle}
      />
    );
  }

  const pointsAttr = points.map((p) => `${p[0]},${p[1]}`).join(' ');

  return <polygon points={pointsAttr} {...sharedStyle} />;
}

function Handle({ cx, cy }: { cx: number; cy: number }) {
  return (
    <rect
      x={cx - HALF_HANDLE}
      y={cy - HALF_HANDLE}
      width={HANDLE_SIZE}
      height={HANDLE_SIZE}
      fill="white"
      stroke="#3b82f6"
      strokeWidth={1}
    />
  );
}

function BoundingBox({
  bbox,
  tightBBox,
  isDragging,
  dragOffset,
  isResizing,
  resizeBBox,
}: {
  /** Container bounds (for resize handles) */
  bbox: BBox;
  /** Tight content bounds (for selection highlight border) */
  tightBBox?: BBox | null;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  isResizing: boolean;
  resizeBBox: BBox | null;
}) {
  // Use the live resize bbox when resizing, otherwise apply drag offset
  const effectiveBBox = isResizing && resizeBBox ? resizeBBox : bbox;
  const ox = isDragging ? dragOffset.x : 0;
  const oy = isDragging ? dragOffset.y : 0;

  // Handles use container bounds
  const hx = effectiveBBox.minX + ox;
  const hy = effectiveBBox.minY + oy;
  const hw = effectiveBBox.maxX - effectiveBBox.minX;
  const hh = effectiveBBox.maxY - effectiveBBox.minY;

  const midX = hx + hw / 2;
  const midY = hy + hh / 2;
  const right = hx + hw;
  const bottom = hy + hh;

  const handles: { cx: number; cy: number }[] = [
    { cx: hx, cy: hy }, // TL
    { cx: midX, cy: hy }, // TC
    { cx: right, cy: hy }, // TR
    { cx: hx, cy: midY }, // ML
    { cx: right, cy: midY }, // MR
    { cx: hx, cy: bottom }, // BL
    { cx: midX, cy: bottom }, // BC
    { cx: right, cy: bottom }, // BR
  ];

  // Selection highlight border uses tight bounds (falls back to container bounds)
  const highlightBBox =
    !isResizing && tightBBox ? tightBBox : effectiveBBox;
  const bx = highlightBBox.minX + ox;
  const by = highlightBBox.minY + oy;
  const bw = highlightBBox.maxX - highlightBBox.minX;
  const bh = highlightBBox.maxY - highlightBBox.minY;

  return (
    <g>
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.5}
        strokeDasharray="6 3"
      />
      {handles.map((h, i) => (
        <Handle key={i} cx={h.cx} cy={h.cy} />
      ))}
    </g>
  );
}

export function SelectionOverlay({
  selectionPath,
  isRectMode,
  selectionBBox,
  tightSelectionBBox,
  isDragging,
  dragOffset,
  isResizing,
  resizeBBox,
}: SelectionOverlayProps) {
  return (
    <svg
      className="absolute inset-0"
      viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
      style={{ pointerEvents: 'none' }}
    >
      {selectionPath && (
        <SelectionPath points={selectionPath} isRectMode={isRectMode} />
      )}
      {selectionBBox && (
        <BoundingBox
          bbox={selectionBBox}
          tightBBox={tightSelectionBBox}
          isDragging={isDragging}
          dragOffset={dragOffset}
          isResizing={isResizing}
          resizeBBox={resizeBBox}
        />
      )}
    </svg>
  );
}
