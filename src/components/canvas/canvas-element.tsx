'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { MIN_ELEMENT_WIDTH, MIN_ELEMENT_HEIGHT } from '@/lib/canvas/types';

interface CanvasElementProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  children: React.ReactNode;
}

type ResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';

const HANDLE_SIZE = 8;

const handlePositions: Record<
  ResizeHandle,
  { top?: string; bottom?: string; left?: string; right?: string; cursor: string; transform: string }
> = {
  'top-left': { top: '0', left: '0', cursor: 'nwse-resize', transform: 'translate(-50%, -50%)' },
  top: { top: '0', left: '50%', cursor: 'ns-resize', transform: 'translate(-50%, -50%)' },
  'top-right': { top: '0', right: '0', cursor: 'nesw-resize', transform: 'translate(50%, -50%)' },
  right: { top: '50%', right: '0', cursor: 'ew-resize', transform: 'translate(50%, -50%)' },
  'bottom-right': { bottom: '0', right: '0', cursor: 'nwse-resize', transform: 'translate(50%, 50%)' },
  bottom: { bottom: '0', left: '50%', cursor: 'ns-resize', transform: 'translate(-50%, 50%)' },
  'bottom-left': { bottom: '0', left: '0', cursor: 'nesw-resize', transform: 'translate(-50%, 50%)' },
  left: { top: '50%', left: '0', cursor: 'ew-resize', transform: 'translate(-50%, -50%)' },
};

export default function CanvasElement({
  id,
  x,
  y,
  width,
  height,
  selected,
  onSelect,
  onDeselect,
  onMove,
  onResize,
  children,
}: CanvasElementProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    type: 'move' | 'resize';
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    handle?: ResizeHandle;
  } | null>(null);

  // Click-outside to deselect
  useEffect(() => {
    if (!selected) return;

    function handlePointerDown(e: PointerEvent) {
      if (elementRef.current && !elementRef.current.contains(e.target as Node)) {
        onDeselect();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [selected, onDeselect]);

  // Shared pointer move/up handlers attached during drag
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const state = dragState.current;
      if (!state) return;

      const dx = e.clientX - state.startPointerX;
      const dy = e.clientY - state.startPointerY;

      if (state.type === 'move') {
        onMove(id, state.startX + dx, state.startY + dy);
        return;
      }

      // Resize
      const handle = state.handle!;
      let newX = state.startX;
      let newY = state.startY;
      let newWidth = state.startWidth;
      let newHeight = state.startHeight;

      // Horizontal adjustments
      if (handle.includes('right')) {
        newWidth = Math.max(MIN_ELEMENT_WIDTH, state.startWidth + dx);
      } else if (handle.includes('left')) {
        const proposedWidth = state.startWidth - dx;
        if (proposedWidth >= MIN_ELEMENT_WIDTH) {
          newWidth = proposedWidth;
          newX = state.startX + dx;
        } else {
          newWidth = MIN_ELEMENT_WIDTH;
          newX = state.startX + (state.startWidth - MIN_ELEMENT_WIDTH);
        }
      }

      // Vertical adjustments
      if (handle.includes('bottom')) {
        newHeight = Math.max(MIN_ELEMENT_HEIGHT, state.startHeight + dy);
      } else if (handle.includes('top')) {
        const proposedHeight = state.startHeight - dy;
        if (proposedHeight >= MIN_ELEMENT_HEIGHT) {
          newHeight = proposedHeight;
          newY = state.startY + dy;
        } else {
          newHeight = MIN_ELEMENT_HEIGHT;
          newY = state.startY + (state.startHeight - MIN_ELEMENT_HEIGHT);
        }
      }

      // When resizing from left or top edges, position also changes
      if (newX !== state.startX || newY !== state.startY) {
        onMove(id, newX, newY);
      }
      onResize(id, newWidth, newHeight);
    },
    [id, onMove, onResize]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      dragState.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    []
  );

  // Start move drag from the element border area
  const handleMovePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only primary button
      if (e.button !== 0) return;
      e.stopPropagation();

      onSelect(id);

      dragState.current = {
        type: 'move',
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startX: x,
        startY: y,
        startWidth: width,
        startHeight: height,
      };

      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [id, x, y, width, height, onSelect]
  );

  // Start resize drag from a handle
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
      if (e.button !== 0) return;
      e.stopPropagation();

      dragState.current = {
        type: 'resize',
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startX: x,
        startY: y,
        startWidth: width,
        startHeight: height,
        handle,
      };

      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [x, y, width, height]
  );

  // Unified pointer event handlers bound to native events via capture target
  const onPointerMoveHandler = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return;
      handlePointerMove(e.nativeEvent);
    },
    [handlePointerMove]
  );

  const onPointerUpHandler = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return;
      handlePointerUp(e.nativeEvent);
    },
    [handlePointerUp]
  );

  // Select on click (without drag)
  const handleElementClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onSelect(id);
    },
    [id, onSelect]
  );

  return (
    <div
      ref={elementRef}
      data-element-id={id}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      className={`group ${selected ? 'ring-2 ring-blue-500' : ''}`}
      onPointerDown={handleElementClick}
      onPointerMove={onPointerMoveHandler}
      onPointerUp={onPointerUpHandler}
    >
      {/* Drag-to-move border area — a transparent border region around the element */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ pointerEvents: 'none' }}
      >
        {/* Top edge */}
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-move"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={handleMovePointerDown}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
        />
        {/* Bottom edge */}
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-move"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={handleMovePointerDown}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
        />
        {/* Left edge */}
        <div
          className="absolute top-2 bottom-2 left-0 w-2 cursor-move"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={handleMovePointerDown}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
        />
        {/* Right edge */}
        <div
          className="absolute top-2 bottom-2 right-0 w-2 cursor-move"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={handleMovePointerDown}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
        />
      </div>

      {/* Children (editor content) */}
      <div className="absolute inset-0 overflow-hidden">{children}</div>

      {/* Resize handles — only visible when selected */}
      {selected &&
        (Object.entries(handlePositions) as [ResizeHandle, typeof handlePositions[ResizeHandle]][]).map(
          ([handle, pos]) => (
            <div
              key={handle}
              className="absolute z-10 bg-white border-2 border-blue-500 rounded-sm"
              style={{
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                right: pos.right,
                cursor: pos.cursor,
                transform: pos.transform,
              }}
              onPointerDown={(e) => handleResizePointerDown(e, handle)}
              onPointerMove={onPointerMoveHandler}
              onPointerUp={onPointerUpHandler}
            />
          )
        )}
    </div>
  );
}
