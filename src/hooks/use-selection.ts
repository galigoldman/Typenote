'use client';

import { useCallback, useRef, useState } from 'react';
import type { CanvasTool, Stroke, BBox } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import {
  isStrokeInSelection,
  aabbIntersectsRect,
  getSelectionBBox,
  computeBBox,
} from '@/lib/canvas/stroke-utils';

type SelectionState = 'idle' | 'drawing' | 'selected' | 'dragging';

interface UseSelectionOptions {
  activeTool: CanvasTool;
  getPageStrokes: (pageId: string) => Stroke[];
  onStrokesMove: (
    pageId: string,
    movedStrokes: { id: string; points: Stroke['points']; bbox: BBox }[],
  ) => void;
}

interface UseSelectionReturn {
  handlePointerDown: (e: React.PointerEvent, pageId: string) => void;
  handlePointerMove: (e: React.PointerEvent, pageId: string) => void;
  handlePointerUp: (e: React.PointerEvent, pageId: string) => void;
  /** Points of the lasso/rect being drawn */
  selectionPath: [number, number][] | null;
  /** IDs of currently selected strokes */
  selectedStrokeIds: Set<string>;
  /** Bounding box of all selected strokes */
  selectionBBox: BBox | null;
  /** Whether rectangle selection mode (vs freeform lasso) */
  isRectMode: boolean;
  /** Whether currently dragging selected objects */
  isDragging: boolean;
  /** Drag offset for visual feedback */
  dragOffset: { x: number; y: number };
  /** Clear the current selection */
  clearSelection: () => void;
}

export function useSelection({
  activeTool,
  getPageStrokes,
  onStrokesMove,
}: UseSelectionOptions): UseSelectionReturn {
  const [selectionPath, setSelectionPath] = useState<[number, number][] | null>(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(new Set());
  const [selectionBBox, setSelectionBBox] = useState<BBox | null>(null);
  const [isRectMode, setIsRectMode] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const stateRef = useRef<SelectionState>('idle');
  const activePageIdRef = useRef<string | null>(null);
  const startPointRef = useRef<[number, number] | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedStrokesRef = useRef<Stroke[]>([]);

  const screenToPageCoords = (
    e: React.PointerEvent,
  ): { x: number; y: number } => {
    const el = e.target as HTMLElement;
    const rect = el.getBoundingClientRect();
    const scaleX = PAGE_WIDTH / rect.width;
    const scaleY = PAGE_HEIGHT / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX * 10) / 10,
      y: Math.round((e.clientY - rect.top) * scaleY * 10) / 10,
    };
  };

  const clearSelection = useCallback(() => {
    stateRef.current = 'idle';
    setSelectionPath(null);
    setSelectedStrokeIds(new Set());
    setSelectionBBox(null);
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    selectedStrokesRef.current = [];
    activePageIdRef.current = null;
    startPointRef.current = null;
    dragStartRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== ('selection' as CanvasTool)) return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const { x, y } = screenToPageCoords(e);

      // If we have a selection, check if clicking inside the bbox to start dragging
      if (stateRef.current === 'selected' && selectionBBox) {
        if (
          x >= selectionBBox.minX &&
          x <= selectionBBox.maxX &&
          y >= selectionBBox.minY &&
          y <= selectionBBox.maxY
        ) {
          stateRef.current = 'dragging';
          setIsDragging(true);
          dragStartRef.current = { x, y };
          setDragOffset({ x: 0, y: 0 });
          return;
        }
        // Clicked outside selection — clear and start new
        clearSelection();
      }

      // Start new selection
      stateRef.current = 'drawing';
      activePageIdRef.current = pageId;
      startPointRef.current = [x, y];
      setSelectionPath([[x, y]]);
      setIsRectMode(true); // default to rect
    },
    [activeTool, selectionBBox, clearSelection],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, _pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== ('selection' as CanvasTool)) return;

      const { x, y } = screenToPageCoords(e);

      if (stateRef.current === 'drawing') {
        e.preventDefault();
        setSelectionPath((prev) => {
          if (!prev) return [[x, y]];
          return [...prev, [x, y]];
        });
      } else if (stateRef.current === 'dragging' && dragStartRef.current) {
        e.preventDefault();
        const dx = x - dragStartRef.current.x;
        const dy = y - dragStartRef.current.y;
        setDragOffset({ x: dx, y: dy });
      }
    },
    [activeTool],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (e.pointerType !== 'pen') return;
      if (activeTool !== ('selection' as CanvasTool)) return;

      e.preventDefault();

      if (stateRef.current === 'drawing') {
        // Finalize selection — run hit detection
        const targetPageId = activePageIdRef.current ?? pageId;
        const strokes = getPageStrokes(targetPageId);

        if (selectionPath && selectionPath.length >= 2 && startPointRef.current) {
          // For rect mode, build rect polygon from start and current point
          const { x, y } = screenToPageCoords(e);
          const [sx, sy] = startPointRef.current;

          const rectPolygon: [number, number][] = [
            [Math.min(sx, x), Math.min(sy, y)],
            [Math.max(sx, x), Math.min(sy, y)],
            [Math.max(sx, x), Math.max(sy, y)],
            [Math.min(sx, x), Math.max(sy, y)],
          ];

          // Use rect for hit detection (simpler & more reliable)
          const selectionRect = {
            minX: Math.min(sx, x),
            minY: Math.min(sy, y),
            maxX: Math.max(sx, x),
            maxY: Math.max(sy, y),
          };

          const selected: string[] = [];
          const selectedStrokes: Stroke[] = [];

          for (const stroke of strokes) {
            // Broad-phase: bbox must intersect selection rect
            if (!aabbIntersectsRect(stroke.bbox, selectionRect)) continue;

            // Narrow-phase: any point inside rect polygon
            if (isStrokeInSelection(stroke, rectPolygon)) {
              selected.push(stroke.id);
              selectedStrokes.push(stroke);
            }
          }

          if (selected.length > 0) {
            stateRef.current = 'selected';
            setSelectedStrokeIds(new Set(selected));
            setSelectionBBox(getSelectionBBox(selectedStrokes));
            selectedStrokesRef.current = selectedStrokes;
            setSelectionPath(null);
          } else {
            clearSelection();
          }
        } else {
          clearSelection();
        }
      } else if (stateRef.current === 'dragging') {
        // Commit the move
        const targetPageId = activePageIdRef.current ?? pageId;

        if (dragStartRef.current && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
          const dx = dragOffset.x;
          const dy = dragOffset.y;

          const movedStrokes = selectedStrokesRef.current.map((stroke) => {
            const newPoints = stroke.points.map(
              ([px, py, pressure]) =>
                [px + dx, py + dy, pressure] as Stroke['points'][0],
            );
            return {
              id: stroke.id,
              points: newPoints,
              bbox: computeBBox(newPoints),
            };
          });

          onStrokesMove(targetPageId, movedStrokes);

          // Update selection bbox to reflect new position
          if (selectionBBox) {
            setSelectionBBox({
              minX: selectionBBox.minX + dx,
              minY: selectionBBox.minY + dy,
              maxX: selectionBBox.maxX + dx,
              maxY: selectionBBox.maxY + dy,
            });
          }

          // Update cached strokes
          selectedStrokesRef.current = selectedStrokesRef.current.map((stroke) => ({
            ...stroke,
            points: stroke.points.map(
              ([px, py, pressure]) =>
                [px + dx, py + dy, pressure] as Stroke['points'][0],
            ),
            bbox: computeBBox(
              stroke.points.map(
                ([px, py, pressure]) =>
                  [px + dx, py + dy, pressure] as Stroke['points'][0],
              ),
            ),
          }));
        }

        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
        stateRef.current = 'selected';
        dragStartRef.current = null;
      }
    },
    [activeTool, selectionPath, selectionBBox, dragOffset, getPageStrokes, onStrokesMove, clearSelection],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    selectionPath,
    selectedStrokeIds,
    selectionBBox,
    isRectMode,
    isDragging,
    dragOffset,
    clearSelection,
  };
}
