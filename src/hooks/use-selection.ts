'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  CanvasTool,
  ImageObject,
  Stroke,
  TextBox,
  BBox,
  ClipboardData,
} from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import {
  isStrokeInSelection,
  aabbIntersectsRect,
  getSelectionBBox,
  computeBBox,
} from '@/lib/canvas/stroke-utils';
import { lockScroll } from '@/lib/canvas/scroll-lock';

type SelectionState = 'idle' | 'drawing' | 'selected' | 'dragging' | 'resizing';

type ResizeHandle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br';

interface UseSelectionOptions {
  activeTool: CanvasTool;
  getPageStrokes: (pageId: string) => Stroke[];
  getPageTextBoxes: (pageId: string) => TextBox[];
  getPageImages?: (pageId: string) => ImageObject[];
  onStrokesMove: (
    pageId: string,
    movedStrokes: { id: string; points: Stroke['points']; bbox: BBox }[],
  ) => void;
  onTextBoxMove?: (
    pageId: string,
    textBoxId: string,
    dx: number,
    dy: number,
  ) => void;
  onTextBoxResize?: (
    pageId: string,
    textBoxId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontScale: number,
  ) => void;
  onImagesMove?: (pageId: string, imageIds: string[], dx: number, dy: number) => void;
  onImageResize?: (
    pageId: string,
    imageId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  onModeChange?: (mode: CanvasTool) => void;
  onDeleteSelected?: (
    pageId: string,
    strokeIds: string[],
    textBoxIds: string[],
    imageIds?: string[],
  ) => void;
  /** Called when user draws a rectangle that contains no objects (empty area crop) */
  onEmptyRectSelection?: (pageId: string, bbox: BBox) => void;
  /** Called when user pastes clipboard contents at a position */
  onPaste?: (pageId: string, strokes: Stroke[], textBoxes: TextBox[], images?: ImageObject[]) => void;
  /** Signal from parent to auto-select a just-pasted image */
  pendingImageSelect?: { pageId: string; imageId: string } | null;
  onPendingImageSelectConsumed?: () => void;
}

interface UseSelectionReturn {
  handlePointerDown: (e: React.PointerEvent, pageId: string) => void;
  handlePointerMove: (e: React.PointerEvent, pageId: string) => void;
  handlePointerUp: (e: React.PointerEvent, pageId: string) => void;
  selectionPath: [number, number][] | null;
  selectedStrokeIds: Set<string>;
  selectedTextBoxIds: Set<string>;
  selectedImageIds: Set<string>;
  /** Page ID that owns the current selection */
  selectionPageId: string | null;
  /** Container-based selection bbox (used for resize handles and drag) */
  selectionBBox: BBox | null;
  /** Tight content-based selection bbox (used for selection highlight border) */
  tightSelectionBBox: BBox | null;
  isRectMode: boolean;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  isResizing: boolean;
  resizeBBox: BBox | null;
  clearSelection: () => void;
  deleteSelected: () => void;
  copySelection: () => void;
  hasClipboardData: boolean;
  pasteAtPosition: (x: number, y: number, pageId: string) => void;
  clearClipboard: () => void;
  longPressIndicator: { x: number; y: number; isVisible: boolean };
}

const TAP_THRESHOLD = 5;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 15;

const SELECTION_PADDING = 4;
const MIN_SELECTABLE_SIZE = 24;

/**
 * Get tight selectable bounds for a text box based on actual rendered content.
 * Falls back to a minimum 24x24 area for empty text boxes.
 */
function getSelectableBBox(tb: TextBox): BBox {
  if (tb.contentBounds) {
    return {
      minX: tb.x + tb.contentBounds.offsetX - SELECTION_PADDING,
      minY: tb.y - SELECTION_PADDING,
      maxX:
        tb.x +
        tb.contentBounds.offsetX +
        tb.contentBounds.width +
        SELECTION_PADDING,
      maxY: tb.y + tb.height + SELECTION_PADDING,
    };
  }
  // Empty or unmeasured — use minimum selectable area
  return {
    minX: tb.x,
    minY: tb.y,
    maxX: tb.x + Math.max(tb.width, MIN_SELECTABLE_SIZE),
    maxY: tb.y + Math.max(tb.height, MIN_SELECTABLE_SIZE),
  };
}

/**
 * Get the full container bounds for a text box (used for resize handles,
 * drag detection, and selection display — not for hit-testing).
 */
function getContainerBBox(tb: TextBox): BBox {
  return {
    minX: tb.x,
    minY: tb.y,
    maxX: tb.x + tb.width,
    maxY: tb.y + tb.height,
  };
}

const HANDLE_SIZE = 6;
const HANDLE_HIT_RADIUS = 8;
const MIN_RESIZE_SIZE = 20;

const HANDLE_KEYS: ResizeHandle[] = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mr',
  'bl',
  'bc',
  'br',
];

function getHandlePositions(
  bbox: BBox,
): Record<ResizeHandle, { x: number; y: number }> {
  const midX = (bbox.minX + bbox.maxX) / 2;
  const midY = (bbox.minY + bbox.maxY) / 2;
  return {
    tl: { x: bbox.minX, y: bbox.minY },
    tc: { x: midX, y: bbox.minY },
    tr: { x: bbox.maxX, y: bbox.minY },
    ml: { x: bbox.minX, y: midY },
    mr: { x: bbox.maxX, y: midY },
    bl: { x: bbox.minX, y: bbox.maxY },
    bc: { x: midX, y: bbox.maxY },
    br: { x: bbox.maxX, y: bbox.maxY },
  };
}

function hitTestHandle(x: number, y: number, bbox: BBox): ResizeHandle | null {
  const positions = getHandlePositions(bbox);
  for (const key of HANDLE_KEYS) {
    const pos = positions[key];
    if (Math.hypot(x - pos.x, y - pos.y) <= HANDLE_HIT_RADIUS) {
      return key;
    }
  }
  return null;
}

export { HANDLE_SIZE };

export function useSelection({
  activeTool,
  getPageStrokes,
  getPageTextBoxes,
  getPageImages,
  onStrokesMove,
  onTextBoxMove,
  onTextBoxResize,
  onImagesMove,
  onImageResize,
  onModeChange,
  onDeleteSelected,
  onEmptyRectSelection,
  onPaste,
  pendingImageSelect,
  onPendingImageSelectConsumed,
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
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectionPageId, setSelectionPageId] = useState<string | null>(null);
  const [selectionBBox, setSelectionBBox] = useState<BBox | null>(null);
  const [tightSelectionBBox, setTightSelectionBBox] = useState<BBox | null>(
    null,
  );
  const [isRectMode, setIsRectMode] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeBBox, setResizeBBox] = useState<BBox | null>(null);

  const stateRef = useRef<SelectionState>('idle');
  const activePageIdRef = useRef<string | null>(null);
  const startPointRef = useRef<[number, number] | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedStrokesRef = useRef<Stroke[]>([]);
  const selectedTextBoxIdsRef = useRef<Set<string>>(new Set());
  const selectedImageIdsRef = useRef<Set<string>>(new Set());
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const resizeHandleRef = useRef<ResizeHandle | null>(null);
  const resizeStartBBoxRef = useRef<BBox | null>(null);
  const resizeBBoxRef = useRef<BBox | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);

  // Clipboard for copy/paste
  const clipboardRef = useRef<ClipboardData | null>(null);
  const [hasClipboardData, setHasClipboardData] = useState(false);

  // Long-press detection for paste
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressPageIdRef = useRef<string | null>(null);
  const [longPressIndicator, setLongPressIndicator] = useState<{
    x: number;
    y: number;
    isVisible: boolean;
  }>({ x: 0, y: 0, isVisible: false });

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
    setSelectedImageIds(new Set());
    setSelectionPageId(null);
    setSelectionBBox(null);
    setTightSelectionBBox(null);
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    setIsResizing(false);
    setResizeBBox(null);
    selectedStrokesRef.current = [];
    selectedTextBoxIdsRef.current = new Set();
    selectedImageIdsRef.current = new Set();
    activePageIdRef.current = null;
    startPointRef.current = null;
    dragStartRef.current = null;
    resizeHandleRef.current = null;
    resizeStartBBoxRef.current = null;
    resizeBBoxRef.current = null;
    if (unlockScrollRef.current) {
      unlockScrollRef.current();
      unlockScrollRef.current = null;
    }
  }, []);

  const deleteSelected = useCallback(() => {
    if (!activePageIdRef.current) return;
    if (
      selectedStrokesRef.current.length === 0 &&
      selectedTextBoxIdsRef.current.size === 0 &&
      selectedImageIdsRef.current.size === 0
    )
      return;
    onDeleteSelected?.(
      activePageIdRef.current,
      selectedStrokesRef.current.map((s) => s.id),
      Array.from(selectedTextBoxIdsRef.current),
      Array.from(selectedImageIdsRef.current),
    );
    clearSelection();
  }, [onDeleteSelected, clearSelection]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
    longPressPageIdRef.current = null;
    setLongPressIndicator((prev) =>
      prev.isVisible ? { ...prev, isVisible: false } : prev,
    );
  }, []);

  const copySelection = useCallback(() => {
    if (!activePageIdRef.current) return;
    if (
      selectedStrokesRef.current.length === 0 &&
      selectedTextBoxIdsRef.current.size === 0 &&
      selectedImageIdsRef.current.size === 0
    )
      return;

    const pageId = activePageIdRef.current;
    const strokes = selectedStrokesRef.current;
    const textBoxes =
      selectedTextBoxIdsRef.current.size > 0
        ? getPageTextBoxes(pageId).filter((tb) =>
            selectedTextBoxIdsRef.current.has(tb.id),
          )
        : [];
    const images =
      selectedImageIdsRef.current.size > 0
        ? (getPageImages?.(pageId) ?? []).filter((img) =>
            selectedImageIdsRef.current.has(img.id),
          )
        : [];

    // Compute origin as center of selection bbox
    const allBBoxes: BBox[] = [
      ...strokes.map((s) => s.bbox),
      ...textBoxes.map((tb) => ({
        minX: tb.x,
        minY: tb.y,
        maxX: tb.x + tb.width,
        maxY: tb.y + tb.height,
      })),
      ...images.map((img) => ({
        minX: img.x,
        minY: img.y,
        maxX: img.x + img.width,
        maxY: img.y + img.height,
      })),
    ];
    if (allBBoxes.length === 0) return;
    const unionBBox = {
      minX: Math.min(...allBBoxes.map((b) => b.minX)),
      minY: Math.min(...allBBoxes.map((b) => b.minY)),
      maxX: Math.max(...allBBoxes.map((b) => b.maxX)),
      maxY: Math.max(...allBBoxes.map((b) => b.maxY)),
    };
    const originX = (unionBBox.minX + unionBBox.maxX) / 2;
    const originY = (unionBBox.minY + unionBBox.maxY) / 2;

    // Deep-clone strokes and text boxes
    clipboardRef.current = {
      strokes: strokes.map((s) => ({
        ...s,
        points: s.points.map(
          ([px, py, pr]) => [px, py, pr] as Stroke['points'][0],
        ),
        bbox: { ...s.bbox },
      })),
      textBoxes: textBoxes.map((tb) => ({
        ...tb,
        content: tb.content ? JSON.parse(JSON.stringify(tb.content)) : null,
      })),
      images: images.map((img) => ({ ...img })),
      originX,
      originY,
      sourcePageId: pageId,
    };
    setHasClipboardData(true);
  }, [getPageTextBoxes, getPageImages]);

  const clearClipboard = useCallback(() => {
    clipboardRef.current = null;
    setHasClipboardData(false);
  }, []);

  /** Compute union bounding box from raw arrays (used by paste before state is set) */
  const computeUnionBBoxFromArrays = (
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

  const pasteAtPosition = useCallback(
    (targetX: number, targetY: number, pageId: string) => {
      const clipboard = clipboardRef.current;
      if (!clipboard) return;

      let dx = targetX - clipboard.originX;
      let dy = targetY - clipboard.originY;

      // Clamp: compute what the pasted union bbox would be and adjust if out of bounds
      const clipImages = clipboard.images ?? [];
      const allSourceBBoxes: BBox[] = [
        ...clipboard.strokes.map((s) => s.bbox),
        ...clipboard.textBoxes.map((tb) => ({
          minX: tb.x,
          minY: tb.y,
          maxX: tb.x + tb.width,
          maxY: tb.y + tb.height,
        })),
        ...clipImages.map((img) => ({
          minX: img.x,
          minY: img.y,
          maxX: img.x + img.width,
          maxY: img.y + img.height,
        })),
      ];
      if (allSourceBBoxes.length > 0) {
        const srcUnion = {
          minX: Math.min(...allSourceBBoxes.map((b) => b.minX)),
          minY: Math.min(...allSourceBBoxes.map((b) => b.minY)),
          maxX: Math.max(...allSourceBBoxes.map((b) => b.maxX)),
          maxY: Math.max(...allSourceBBoxes.map((b) => b.maxY)),
        };
        const pastedMinX = srcUnion.minX + dx;
        const pastedMinY = srcUnion.minY + dy;
        const pastedMaxX = srcUnion.maxX + dx;
        const pastedMaxY = srcUnion.maxY + dy;
        if (pastedMinX < 0) dx -= pastedMinX;
        if (pastedMinY < 0) dy -= pastedMinY;
        if (pastedMaxX > PAGE_WIDTH) dx -= pastedMaxX - PAGE_WIDTH;
        if (pastedMaxY > PAGE_HEIGHT) dy -= pastedMaxY - PAGE_HEIGHT;
      }

      // Clone strokes with new IDs and offset positions
      const newStrokes: Stroke[] = clipboard.strokes.map((s) => {
        const newPoints = s.points.map(
          ([px, py, pr]) => [px + dx, py + dy, pr] as Stroke['points'][0],
        );
        const newBBox = computeBBox(newPoints);
        return {
          ...s,
          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
          points: newPoints,
          bbox: newBBox,
          createdAt: Date.now(),
        };
      });

      // Clone text boxes with new IDs and offset positions
      const newTextBoxes: TextBox[] = clipboard.textBoxes.map((tb) => ({
        ...tb,
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        x: tb.x + dx,
        y: tb.y + dy,
        content: tb.content ? JSON.parse(JSON.stringify(tb.content)) : null,
      }));

      // Clone images with new IDs and offset positions
      const newImages: ImageObject[] = clipImages.map((img) => ({
        ...img,
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        x: img.x + dx,
        y: img.y + dy,
        createdAt: Date.now(),
      }));

      // Notify parent to add pasted elements and push undo action
      onPaste?.(pageId, newStrokes, newTextBoxes, newImages);

      // Auto-select pasted elements
      const newStrokeIds = new Set(newStrokes.map((s) => s.id));
      const newTextBoxIds = new Set(newTextBoxes.map((tb) => tb.id));
      const newImageIds = new Set(newImages.map((img) => img.id));
      stateRef.current = 'selected';
      activePageIdRef.current = pageId;
      setSelectionPageId(pageId);
      setSelectedStrokeIds(newStrokeIds);
      selectedStrokesRef.current = newStrokes;
      setSelectedTextBoxIds(newTextBoxIds);
      selectedTextBoxIdsRef.current = newTextBoxIds;
      setSelectedImageIds(newImageIds);
      selectedImageIdsRef.current = newImageIds;

      // Compute union bbox including images
      const imgBBoxes: BBox[] = newImages.map((img) => ({
        minX: img.x, minY: img.y,
        maxX: img.x + img.width, maxY: img.y + img.height,
      }));
      const allBBoxes: BBox[] = [
        ...newStrokes.map((s) => s.bbox),
        ...newTextBoxes.map((tb) => ({
          minX: tb.x, minY: tb.y,
          maxX: tb.x + tb.width, maxY: tb.y + tb.height,
        })),
        ...imgBBoxes,
      ];
      const unionBBox = allBBoxes.length > 0 ? {
        minX: Math.min(...allBBoxes.map((b) => b.minX)),
        minY: Math.min(...allBBoxes.map((b) => b.minY)),
        maxX: Math.max(...allBBoxes.map((b) => b.maxX)),
        maxY: Math.max(...allBBoxes.map((b) => b.maxY)),
      } : null;
      setSelectionBBox(unionBBox);
      setTightSelectionBBox(unionBBox);
      setSelectionPath(null);
    },
    [onPaste],
  );

  const computeUnionBBox = (
    strokes: Stroke[],
    textBoxes: TextBox[],
    images: ImageObject[] = [],
  ): BBox | null => {
    const bboxes: BBox[] = [];
    for (const s of strokes) bboxes.push(s.bbox);
    for (const tb of textBoxes) {
      bboxes.push(getContainerBBox(tb));
    }
    for (const img of images) {
      bboxes.push({ minX: img.x, minY: img.y, maxX: img.x + img.width, maxY: img.y + img.height });
    }
    if (bboxes.length === 0) return null;
    return {
      minX: Math.min(...bboxes.map((b) => b.minX)),
      minY: Math.min(...bboxes.map((b) => b.minY)),
      maxX: Math.max(...bboxes.map((b) => b.maxX)),
      maxY: Math.max(...bboxes.map((b) => b.maxY)),
    };
  };

  const computeTightUnionBBox = (
    strokes: Stroke[],
    textBoxes: TextBox[],
    images: ImageObject[] = [],
  ): BBox | null => {
    const bboxes: BBox[] = [];
    for (const s of strokes) bboxes.push(s.bbox);
    for (const tb of textBoxes) {
      bboxes.push(getSelectableBBox(tb));
    }
    for (const img of images) {
      bboxes.push({ minX: img.x, minY: img.y, maxX: img.x + img.width, maxY: img.y + img.height });
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
      // Only pen and mouse trigger selection — finger touch should scroll
      if (e.pointerType === 'touch') return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Lock scrolling during selection interaction
      if (unlockScrollRef.current) unlockScrollRef.current();
      unlockScrollRef.current = lockScroll(e.target as HTMLElement);

      const { x, y } = screenToPageCoords(e);

      // If we have a selection, check for handle hit (resize) or interior drag
      if (stateRef.current === 'selected' && selectionBBox) {
        // Check handles first (resize)
        const handle = hitTestHandle(x, y, selectionBBox);
        if (handle) {
          stateRef.current = 'resizing';
          resizeHandleRef.current = handle;
          resizeStartBBoxRef.current = { ...selectionBBox };
          resizeBBoxRef.current = { ...selectionBBox };
          setIsResizing(true);
          setResizeBBox({ ...selectionBBox });
          return;
        }

        // Check interior (drag)
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

      // Start new selection — but first check for pen long-press paste
      activePageIdRef.current = pageId;
      startPointRef.current = [x, y];

      if (e.pointerType === 'pen' && clipboardRef.current) {
        // Start long-press timer for paste
        longPressOriginRef.current = { x, y };
        longPressPageIdRef.current = pageId;
        setLongPressIndicator({ x, y, isVisible: true });
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          longPressOriginRef.current = null;
          setLongPressIndicator((prev) => ({ ...prev, isVisible: false }));
          // Execute paste at the long-press position
          pasteAtPosition(x, y, pageId);
        }, 500);
      }

      stateRef.current = 'drawing';
      setSelectionPageId(pageId);
      setSelectionPath([[x, y]]);
      setIsRectMode(true);
    },
    [activeTool, selectionBBox, clearSelection, pasteAtPosition],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, _pageId: string) => {
      if (activeTool !== 'select') return;
      if (e.pointerType === 'touch') return;

      const { x, y } = screenToPageCoords(e);

      // Cancel long-press timer if pen moves too far
      if (longPressOriginRef.current && longPressTimerRef.current) {
        const dist = Math.hypot(
          x - longPressOriginRef.current.x,
          y - longPressOriginRef.current.y,
        );
        if (dist > TAP_THRESHOLD) {
          cancelLongPress();
        }
      }

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
      } else if (
        stateRef.current === 'resizing' &&
        resizeHandleRef.current &&
        resizeStartBBoxRef.current
      ) {
        e.preventDefault();
        const orig = resizeStartBBoxRef.current;
        let { minX, minY, maxX, maxY } = orig;
        const handle = resizeHandleRef.current;

        // Adjust edges based on which handle is being dragged
        if (handle === 'tl' || handle === 'ml' || handle === 'bl') {
          minX = x;
        }
        if (handle === 'tr' || handle === 'mr' || handle === 'br') {
          maxX = x;
        }
        if (handle === 'tl' || handle === 'tc' || handle === 'tr') {
          minY = y;
        }
        if (handle === 'bl' || handle === 'bc' || handle === 'br') {
          maxY = y;
        }

        // Enforce minimum size (prevent inversion)
        if (maxX - minX < MIN_RESIZE_SIZE) {
          if (handle === 'tl' || handle === 'ml' || handle === 'bl') {
            minX = maxX - MIN_RESIZE_SIZE;
          } else {
            maxX = minX + MIN_RESIZE_SIZE;
          }
        }
        if (maxY - minY < MIN_RESIZE_SIZE) {
          if (handle === 'tl' || handle === 'tc' || handle === 'tr') {
            minY = maxY - MIN_RESIZE_SIZE;
          } else {
            maxY = minY + MIN_RESIZE_SIZE;
          }
        }

        const newBBox = { minX, minY, maxX, maxY };
        resizeBBoxRef.current = newBBox;
        setResizeBBox(newBBox);
      }
    },
    [activeTool, cancelLongPress],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      if (activeTool !== 'select') return;
      if (e.pointerType === 'touch') return;

      e.preventDefault();

      // Cancel any pending long-press timer
      cancelLongPress();

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
            // For double-tap, use full bounds (user wants to edit the text)
            const tappedTextBox = textBoxes.find((tb) => {
              return (
                x >= tb.x &&
                x <= tb.x + tb.width &&
                y >= tb.y &&
                y <= tb.y + tb.height
              );
            });
            if (tappedTextBox) {
              clearSelection();
              lastTapRef.current = null;
              onModeChange?.('text');
              return;
            }
          }
          lastTapRef.current = { time: now, x, y };

          // Single tap — check images first (higher z-layer), then strokes
          const pageImages = getPageImages?.(targetPageId) ?? [];
          const tappedImage = pageImages.find(
            (img) =>
              x >= img.x &&
              x <= img.x + img.width &&
              y >= img.y &&
              y <= img.y + img.height,
          );
          if (tappedImage) {
            stateRef.current = 'selected';
            activePageIdRef.current = targetPageId;
            setSelectionPageId(targetPageId);
            setSelectedStrokeIds(new Set());
            selectedStrokesRef.current = [];
            setSelectedTextBoxIds(new Set());
            selectedTextBoxIdsRef.current = new Set();
            setSelectedImageIds(new Set([tappedImage.id]));
            selectedImageIdsRef.current = new Set([tappedImage.id]);
            const imgBBox: BBox = {
              minX: tappedImage.x,
              minY: tappedImage.y,
              maxX: tappedImage.x + tappedImage.width,
              maxY: tappedImage.y + tappedImage.height,
            };
            setSelectionBBox(imgBBox);
            setTightSelectionBBox(imgBBox);
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
            setSelectionPageId(targetPageId);
            setSelectedStrokeIds(new Set([tappedStroke.id]));
            selectedStrokesRef.current = [tappedStroke];
            setSelectedTextBoxIds(new Set());
            selectedTextBoxIdsRef.current = new Set();
            setSelectedImageIds(new Set());
            selectedImageIdsRef.current = new Set();
            const strokeBBox = getSelectionBBox([tappedStroke]);
            setSelectionBBox(strokeBBox);
            setTightSelectionBBox(strokeBBox);
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

          // Hit-test images (AABB overlap)
          const rectPageImages = getPageImages?.(targetPageId) ?? [];
          const selectedImgs: ImageObject[] = [];
          for (const img of rectPageImages) {
            const imgBBox: BBox = { minX: img.x, minY: img.y, maxX: img.x + img.width, maxY: img.y + img.height };
            if (aabbIntersectsRect(imgBBox, selectionRect)) {
              selectedImgs.push(img);
            }
          }

          if (selectedStrokes.length > 0 || selectedImgs.length > 0) {
            stateRef.current = 'selected';
            activePageIdRef.current = targetPageId;
            setSelectionPageId(targetPageId);
            setSelectedStrokeIds(new Set(selectedStrokes.map((s) => s.id)));
            selectedStrokesRef.current = selectedStrokes;
            setSelectedTextBoxIds(new Set());
            selectedTextBoxIdsRef.current = new Set();
            const imgIds = new Set(selectedImgs.map((img) => img.id));
            setSelectedImageIds(imgIds);
            selectedImageIdsRef.current = imgIds;
            const unionBBox = computeUnionBBox(selectedStrokes, [], selectedImgs);
            setSelectionBBox(unionBBox);
            setTightSelectionBBox(unionBBox);
            setSelectionPath(null);
          } else {
            // No objects found — fire empty rect callback (used for crop-to-AI)
            onEmptyRectSelection?.(targetPageId, selectionRect);
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

          // Move images
          if (selectedImageIdsRef.current.size > 0) {
            onImagesMove?.(
              targetPageId,
              Array.from(selectedImageIdsRef.current),
              dx,
              dy,
            );
          }

          // Update selection bboxes
          if (selectionBBox) {
            setSelectionBBox({
              minX: selectionBBox.minX + dx,
              minY: selectionBBox.minY + dy,
              maxX: selectionBBox.maxX + dx,
              maxY: selectionBBox.maxY + dy,
            });
          }
          if (tightSelectionBBox) {
            setTightSelectionBBox({
              minX: tightSelectionBBox.minX + dx,
              minY: tightSelectionBBox.minY + dy,
              maxX: tightSelectionBBox.maxX + dx,
              maxY: tightSelectionBBox.maxY + dy,
            });
          }
        }

        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
        stateRef.current = 'selected';
        dragStartRef.current = null;
      } else if (stateRef.current === 'resizing') {
        // Commit the resize
        const targetPageId = activePageIdRef.current ?? pageId;
        const origBBox = resizeStartBBoxRef.current;
        const newBBox = resizeBBoxRef.current;

        if (origBBox && newBBox) {
          const origW = origBBox.maxX - origBBox.minX;
          const origH = origBBox.maxY - origBBox.minY;
          const newW = newBBox.maxX - newBBox.minX;
          const newH = newBBox.maxY - newBBox.minY;

          // Scale strokes proportionally
          if (selectedStrokesRef.current.length > 0 && origW > 0 && origH > 0) {
            const movedStrokes = selectedStrokesRef.current.map((stroke) => {
              const newPoints = stroke.points.map(
                ([px, py, pressure]) =>
                  [
                    newBBox.minX + ((px - origBBox.minX) / origW) * newW,
                    newBBox.minY + ((py - origBBox.minY) / origH) * newH,
                    pressure,
                  ] as Stroke['points'][0],
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
              (stroke) => {
                const newPoints = stroke.points.map(
                  ([px, py, pressure]) =>
                    [
                      newBBox.minX + ((px - origBBox.minX) / origW) * newW,
                      newBBox.minY + ((py - origBBox.minY) / origH) * newH,
                      pressure,
                    ] as Stroke['points'][0],
                );
                return {
                  ...stroke,
                  points: newPoints,
                  bbox: computeBBox(newPoints),
                };
              },
            );
          }

          // Scale text boxes proportionally
          if (
            selectedTextBoxIdsRef.current.size > 0 &&
            origW > 0 &&
            origH > 0
          ) {
            const allTextBoxes = getPageTextBoxes(targetPageId);
            for (const tbId of selectedTextBoxIdsRef.current) {
              const tb = allTextBoxes.find((t) => t.id === tbId);
              if (!tb) continue;
              const newX =
                newBBox.minX + ((tb.x - origBBox.minX) / origW) * newW;
              const newY =
                newBBox.minY + ((tb.y - origBBox.minY) / origH) * newH;
              const newTbW = (tb.width / origW) * newW;
              const newTbH = (tb.height / origH) * newH;
              const widthRatio = newTbW / tb.width;
              const newFontScale = (tb.fontScale ?? 1) * widthRatio;
              onTextBoxResize?.(
                targetPageId,
                tbId,
                newX,
                newY,
                newTbW,
                newTbH,
                newFontScale,
              );
            }
          }

          // Scale images proportionally (aspect-ratio locked)
          // Track actual image bounds to update selection bbox correctly
          let imageBoundsAfterResize: BBox | null = null;
          if (
            selectedImageIdsRef.current.size > 0 &&
            origW > 0 &&
            origH > 0
          ) {
            const allImages = getPageImages?.(targetPageId) ?? [];
            for (const imgId of selectedImageIdsRef.current) {
              const img = allImages.find((i) => i.id === imgId);
              if (!img) continue;
              // Use uniform scale: pick the axis the user dragged most
              const scaleX = newW / origW;
              const scaleY = newH / origH;
              // For aspect-locked images, use the scale that preserves ratio
              // Use average of both axes to be more responsive to user intent
              const scale = (scaleX + scaleY) / 2;
              const newImgW = Math.max(MIN_RESIZE_SIZE, img.width * scale);
              const newImgH = newImgW / img.aspectRatio;
              // Position: anchor at the same relative position within the bbox
              const relX = origW > 0 ? (img.x - origBBox.minX) / origW : 0;
              const relY = origH > 0 ? (img.y - origBBox.minY) / origH : 0;
              const newImgX = newBBox.minX + relX * (newW - newImgW);
              const newImgY = newBBox.minY + relY * (newH - newImgH);
              onImageResize?.(
                targetPageId,
                imgId,
                newImgX,
                newImgY,
                newImgW,
                newImgH,
              );
              // Track bounds for selection bbox update
              const imgBBox: BBox = {
                minX: newImgX,
                minY: newImgY,
                maxX: newImgX + newImgW,
                maxY: newImgY + newImgH,
              };
              if (!imageBoundsAfterResize) {
                imageBoundsAfterResize = { ...imgBBox };
              } else {
                imageBoundsAfterResize.minX = Math.min(imageBoundsAfterResize.minX, imgBBox.minX);
                imageBoundsAfterResize.minY = Math.min(imageBoundsAfterResize.minY, imgBBox.minY);
                imageBoundsAfterResize.maxX = Math.max(imageBoundsAfterResize.maxX, imgBBox.maxX);
                imageBoundsAfterResize.maxY = Math.max(imageBoundsAfterResize.maxY, imgBBox.maxY);
              }
            }
          }

          // Update selection bbox — use actual image bounds if images were resized
          // (prevents bbox/image mismatch from aspect-ratio locking)
          const finalBBox =
            imageBoundsAfterResize &&
            selectedStrokesRef.current.length === 0 &&
            selectedTextBoxIdsRef.current.size === 0
              ? imageBoundsAfterResize
              : newBBox;
          setSelectionBBox(finalBBox);
          setTightSelectionBBox(finalBBox);
        }

        setIsResizing(false);
        setResizeBBox(null);
        resizeHandleRef.current = null;
        resizeStartBBoxRef.current = null;
        resizeBBoxRef.current = null;
        stateRef.current = 'selected';
      }

      // Unlock scroll after any pointer-up
      if (unlockScrollRef.current) {
        unlockScrollRef.current();
        unlockScrollRef.current = null;
      }
    },
    [
      activeTool,
      selectionPath,
      selectionBBox,
      tightSelectionBBox,
      dragOffset,
      getPageStrokes,
      getPageTextBoxes,
      getPageImages,
      onStrokesMove,
      onTextBoxMove,
      onTextBoxResize,
      onImagesMove,
      onImageResize,
      onModeChange,
      onEmptyRectSelection,
      clearSelection,
      cancelLongPress,
    ],
  );

  // Auto-select a just-pasted image when signaled by parent
  if (pendingImageSelect && getPageImages) {
    const { pageId, imageId } = pendingImageSelect;
    const images = getPageImages(pageId);
    const img = images.find((i) => i.id === imageId);
    if (img) {
      // Only trigger once — check if not already selected
      if (!selectedImageIdsRef.current.has(imageId)) {
        stateRef.current = 'selected';
        activePageIdRef.current = pageId;
        setSelectionPageId(pageId);
        setSelectedStrokeIds(new Set());
        selectedStrokesRef.current = [];
        setSelectedTextBoxIds(new Set());
        selectedTextBoxIdsRef.current = new Set();
        const imgIds = new Set([imageId]);
        setSelectedImageIds(imgIds);
        selectedImageIdsRef.current = imgIds;
        const imgBBox: BBox = {
          minX: img.x,
          minY: img.y,
          maxX: img.x + img.width,
          maxY: img.y + img.height,
        };
        setSelectionBBox(imgBBox);
        setTightSelectionBBox(imgBBox);
        setSelectionPath(null);
      }
      onPendingImageSelectConsumed?.();
    }
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    selectionPath,
    selectedStrokeIds,
    selectedTextBoxIds,
    selectedImageIds,
    selectionPageId,
    selectionBBox,
    tightSelectionBBox,
    isRectMode,
    isDragging,
    dragOffset,
    isResizing,
    resizeBBox,
    clearSelection,
    deleteSelected,
    copySelection,
    hasClipboardData,
    pasteAtPosition,
    clearClipboard,
    longPressIndicator,
  };
}
