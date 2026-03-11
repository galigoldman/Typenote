'use client';

import type { BBox } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';

interface SelectionOverlayProps {
  /** Points of the lasso/rect being drawn, null when not drawing */
  selectionPath: [number, number][] | null;
  /** Whether selection mode is rectangle (true) or freeform lasso (false) */
  isRectMode: boolean;
  /** Bounding box of selected objects, null when nothing selected */
  selectionBBox: BBox | null;
  /** Whether currently dragging selected objects */
  isDragging: boolean;
  /** Current drag offset */
  dragOffset: { x: number; y: number };
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
  isDragging,
  dragOffset,
}: {
  bbox: BBox;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
}) {
  const ox = isDragging ? dragOffset.x : 0;
  const oy = isDragging ? dragOffset.y : 0;

  const x = bbox.minX + ox;
  const y = bbox.minY + oy;
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;

  const midX = x + w / 2;
  const midY = y + h / 2;
  const right = x + w;
  const bottom = y + h;

  const handles: { cx: number; cy: number }[] = [
    { cx: x, cy: y }, // TL
    { cx: midX, cy: y }, // TC
    { cx: right, cy: y }, // TR
    { cx: x, cy: midY }, // ML
    { cx: right, cy: midY }, // MR
    { cx: x, cy: bottom }, // BL
    { cx: midX, cy: bottom }, // BC
    { cx: right, cy: bottom }, // BR
  ];

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
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
  isDragging,
  dragOffset,
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
          isDragging={isDragging}
          dragOffset={dragOffset}
        />
      )}
    </svg>
  );
}
