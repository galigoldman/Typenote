'use client';

import { useCallback, useRef, useState } from 'react';
import type { CanvasTool, Stroke, TextBox, BBox } from '@/types/canvas';
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
  getPageTextBoxes: (pageId: string) => TextBox[];
  onStrokesMove: (
    pageId: string,
    movedStrokes: { id: string; points: Stroke['points']; bbox: BBox }[],
  ) => void;
  onTextBoxMove?: (pageId: string, textBoxId: string, dx: number, dy: number) => void;
  onModeChange?: (mode: CanvasTool) => void;
  onDeleteSelected?: (
    pageId: string,
    strokeIds: string[],
    textBoxIds: string[],
  ) => void;
}

interface UseSelectionReturn {
  handlePointerDown: (e: React.PointerEvent, pageId: string) => void;
  handlePointerMove: (e: React.PointerEvent, pageId: string) => void;
  handlePointerUp: (e: React.PointerEvent, pageId: string) => void;
  selectionPath: [number, number][] | null;
  selectedStrokeIds: Set<string>;
  selectedTextBoxIds: Set<string>;
  selectionBBox: BBox | null;
  isRectMode: boolean;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  clearSelection: () => void;
  deleteSelected: () => void;
}

const TAP_THRESHOLD = 5;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 15;

export function useSelection({
  activeTool,
  getPageStrokes,
  getPageTextBoxes,
  onStrokesMove,
  onTextBoxMove,
  onModeChange,
  onDeleteSelected,
}: UseSelectionOptions): UseSelectionReturn {
  const [selectionPath, setSelectionPath] = useState<[number, number][] | null>(
    null,
  );
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTextBoxIds, setSelectedTextBoxIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectionBBox, setSelectionBBox] = useState<BBox | null>(null);
  const [isRectMode, setIsRectMode] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const stateRef = useRef<SelectionState>('idle');
  const activePageIdRef = useRef<string | null>(null);
  const startPointRef = useRef<[number, number] | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedStrokesRef = useRef<Stroke[]>([]);
  const selectedTextBoxIdsRef = useRef<Set<string>>(new Set());
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );

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
    setSelectedTextBoxIds(new Set());
    setSelectionBBox(null);
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    selectedStrokesRef.current = [];
    selectedTextBoxIdsRef.current = new Set();
    activePageIdRef.current = null;
    startPointRef.current = null;
    dragStartRef.current = null;
  }, []);

  const deleteSelected = useCallback(() => {
    if (!activePageIdRef.current) return;
    if (selectedStrokesRef.current.length === 0 && selectedTextBoxIdsRef.current.size === 0) return;
    onDeleteSelected?.(
      activePageIdRef.current,
      selectedStrokesRef.current.map((s) => s.id),
      Array.from(selectedTextBoxIdsRef.current),
    );
    clearSelection();
  }, [onDeleteSelected, clearSelection]);

  const computeUnionBBox = (
    strokes: Stroke[],
    textBoxes: TextBox[],
  ): BBox | null => {
    const bboxes: BBox[] = [];
    for (const s of strokes) bboxes.push(s.bbox);
    for (const tb of textBoxes) {
      bboxes.push({
        minX: tb.x,
        minY: tb.y,
        maxX: tb.x + tb.width,
        maxY: tb.y + tb.height,
      });
    }
    if (bboxes.length === 0) return null;
    return {
      minX: Math.min(...bboxes.map((b) => b.minX)),
      minY: Math.min(...bboxes.map((b) => b.minY)),
      maxX: Math.max(...bboxes.map((b) => b.maxX)),
      maxY: Math.max(...bboxes.map((b) => b.maxY)),
    };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (activeTool !== 'select') return;

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
      setIsRectMode(true);
    },
    [activeTool, selectionBBox, clearSelection],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, _pageId: string) => {
      if (activeTool !== 'select') return;

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
      if (activeTool !== 'select') return;

      e.preventDefault();

      if (stateRef.current === 'drawing') {
        const targetPageId = activePageIdRef.current ?? pageId;
        const strokes = getPageStrokes(targetPageId);
        const textBoxes = getPageTextBoxes(targetPageId);
        const { x, y } = screenToPageCoords(e);

        // Check if it's a tap (small movement)
        const isTap =
          startPointRef.current &&
          Math.abs(x - startPointRef.current[0]) < TAP_THRESHOLD &&
          Math.abs(y - startPointRef.current[1]) < TAP_THRESHOLD;

        if (isTap) {
          // Double-tap detection
          const now = Date.now();
          const last = lastTapRef.current;
          if (
            last &&
            now - last.time < DOUBLE_TAP_DELAY &&
            Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_DISTANCE
          ) {
            // Double-tap — check if on a text box → switch to Type mode
            const tappedTextBox = textBoxes.find(
              (tb) =>
                x >= tb.x &&
                x <= tb.x + tb.width &&
                y >= tb.y &&
                y <= tb.y + tb.height,
            );
            if (tappedTextBox) {
              clearSelection();
              lastTapRef.current = null;
              onModeChange?.('text');
              return;
            }
          }
          lastTapRef.current = { time: now, x, y };

          // Single tap — select one object at tap point
          // Check text boxes first (they render on top)
          const tappedTextBox = textBoxes.find(
            (tb) =>
              x >= tb.x &&
              x <= tb.x + tb.width &&
              y >= tb.y &&
              y <= tb.y + tb.height,
          );
          if (tappedTextBox) {
            stateRef.current = 'selected';
            activePageIdRef.current = targetPageId;
            const tbIds = new Set([tappedTextBox.id]);
            setSelectedTextBoxIds(tbIds);
            selectedTextBoxIdsRef.current = tbIds;
            setSelectedStrokeIds(new Set());
            selectedStrokesRef.current = [];
            setSelectionBBox(
              computeUnionBBox([], [tappedTextBox]),
            );
            setSelectionPath(null);
            return;
          }

          // Check strokes (tap within 10px of any stroke point)
          const tappedStroke = strokes.find((s) => {
            if (
              x < s.bbox.minX - 10 ||
              x > s.bbox.maxX + 10 ||
              y < s.bbox.minY - 10 ||
              y > s.bbox.maxY + 10
            )
              return false;
            return s.points.some(
              ([px, py]) => Math.hypot(px - x, py - y) < 10 + s.width / 2,
            );
          });
          if (tappedStroke) {
            stateRef.current = 'selected';
            activePageIdRef.current = targetPageId;
            setSelectedStrokeIds(new Set([tappedStroke.id]));
            selectedStrokesRef.current = [tappedStroke];
            setSelectedTextBoxIds(new Set());
            selectedTextBoxIdsRef.current = new Set();
            setSelectionBBox(getSelectionBBox([tappedStroke]));
            setSelectionPath(null);
            return;
          }

          // Tapped empty space
          clearSelection();
          return;
        }

        // Rectangle selection — run hit detection
        if (
          selectionPath &&
          selectionPath.length >= 2 &&
          startPointRef.current
        ) {
          const [sx, sy] = startPointRef.current;

          const rectPolygon: [number, number][] = [
            [Math.min(sx, x), Math.min(sy, y)],
            [Math.max(sx, x), Math.min(sy, y)],
            [Math.max(sx, x), Math.max(sy, y)],
            [Math.min(sx, x), Math.max(sy, y)],
          ];

          const selectionRect: BBox = {
            minX: Math.min(sx, x),
            minY: Math.min(sy, y),
            maxX: Math.max(sx, x),
            maxY: Math.max(sy, y),
          };

          const selectedStrokes: Stroke[] = [];
          const selectedTbIds: string[] = [];
          const selectedTbs: TextBox[] = [];

          // Hit-test strokes
          for (const stroke of strokes) {
            if (!aabbIntersectsRect(stroke.bbox, selectionRect)) continue;
            if (isStrokeInSelection(stroke, rectPolygon)) {
              selectedStrokes.push(stroke);
            }
          }

          // Hit-test text boxes
          for (const tb of textBoxes) {
            const tbBox: BBox = {
              minX: tb.x,
              minY: tb.y,
              maxX: tb.x + tb.width,
              maxY: tb.y + tb.height,
            };
            if (aabbIntersectsRect(tbBox, selectionRect)) {
              selectedTbIds.push(tb.id);
              selectedTbs.push(tb);
            }
          }

          if (selectedStrokes.length > 0 || selectedTbIds.length > 0) {
            stateRef.current = 'selected';
            activePageIdRef.current = targetPageId;
            setSelectedStrokeIds(
              new Set(selectedStrokes.map((s) => s.id)),
            );
            selectedStrokesRef.current = selectedStrokes;
            const tbIdSet = new Set(selectedTbIds);
            setSelectedTextBoxIds(tbIdSet);
            selectedTextBoxIdsRef.current = tbIdSet;
            setSelectionBBox(
              computeUnionBBox(selectedStrokes, selectedTbs),
            );
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

        if (
          dragStartRef.current &&
          (dragOffset.x !== 0 || dragOffset.y !== 0)
        ) {
          const dx = dragOffset.x;
          const dy = dragOffset.y;

          // Move strokes
          if (selectedStrokesRef.current.length > 0) {
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

            // Update cached strokes
            selectedStrokesRef.current = selectedStrokesRef.current.map(
              (stroke) => ({
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
              }),
            );
          }

          // Move text boxes
          for (const tbId of selectedTextBoxIdsRef.current) {
            onTextBoxMove?.(targetPageId, tbId, dx, dy);
          }

          // Update selection bbox
          if (selectionBBox) {
            setSelectionBBox({
              minX: selectionBBox.minX + dx,
              minY: selectionBBox.minY + dy,
              maxX: selectionBBox.maxX + dx,
              maxY: selectionBBox.maxY + dy,
            });
          }
        }

        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
        stateRef.current = 'selected';
        dragStartRef.current = null;
      }
    },
    [
      activeTool,
      selectionPath,
      selectionBBox,
      dragOffset,
      getPageStrokes,
      getPageTextBoxes,
      onStrokesMove,
      onTextBoxMove,
      onModeChange,
      clearSelection,
    ],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    selectionPath,
    selectedStrokeIds,
    selectedTextBoxIds,
    selectionBBox,
    isRectMode,
    isDragging,
    dragOffset,
    clearSelection,
    deleteSelected,
  };
}
