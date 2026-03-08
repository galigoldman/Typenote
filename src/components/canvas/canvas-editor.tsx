'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { Document } from '@/types/database';
import type {
  TextBlock as TextBlockType,
  DrawingLayer as DrawingLayerType,
  Stroke,
} from '@/lib/canvas/types';
import { ViewportProvider, useViewport } from '@/lib/canvas/viewport-store';
import { EditorManagerProvider } from '@/lib/canvas/editor-manager';
import { useCanvasState } from '@/hooks/use-canvas-state';
import { createTextBlock } from '@/lib/canvas/element-operations';
import { getVisibleElementIds } from '@/lib/canvas/viewport-culling';
import { getPressure } from '@/lib/canvas/input-router';
import { CanvasViewport } from '@/components/canvas/canvas-viewport';
import { BackgroundRenderer } from '@/components/canvas/background-renderer';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import { CanvasEditorToolbar } from '@/components/canvas/canvas-editor-toolbar';
import {
  DrawingLayer,
  type DrawingLayerHandle,
} from '@/components/canvas/drawing-layer';
import { DrawingToolbar } from '@/components/canvas/drawing-toolbar';
import CanvasElement from '@/components/canvas/canvas-element';
import { TextBlock } from '@/components/canvas/text-block';

interface CanvasEditorProps {
  document: Document;
}

/**
 * Top-level canvas editor — hybrid notebook mode.
 *
 * - Pen/stylus input → draws on the canvas automatically
 * - Mouse / touch → interacts with elements (select, move, resize, edit text)
 * - Double-click on empty canvas → creates a new text block
 * - No mode toggle — everything works seamlessly.
 */
export function CanvasEditor({ document: doc }: CanvasEditorProps) {
  const initialViewport = (
    doc.content as { viewport?: { x: number; y: number; zoom: number } }
  )?.viewport;

  return (
    <ViewportProvider initialViewport={initialViewport}>
      <EditorManagerProvider>
        <CanvasEditorInner document={doc} />
      </EditorManagerProvider>
    </ViewportProvider>
  );
}

function CanvasEditorInner({ document: doc }: CanvasEditorProps) {
  const { viewport } = useViewport();
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<DrawingLayerHandle>(null);
  const {
    canvasDoc,
    elements,
    background,
    addElement,
    updateElement,
    moveElement,
    resizeElement,
    removeElement,
  } = useCanvasState(doc);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Drawing tool state ─────────────────────────────────────────────────
  const [drawColor, setDrawColor] = useState('#000000');
  const [drawWidth, setDrawWidth] = useState(2);
  const [drawTool, setDrawTool] = useState<'pen' | 'eraser'>('pen');

  // ── Pen stroke tracking (refs for performance — no re-renders) ─────────
  const isStrokingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  // Keep latest draw settings in refs so pointer handlers don't go stale
  const drawColorRef = useRef(drawColor);
  drawColorRef.current = drawColor;
  const drawWidthRef = useRef(drawWidth);
  drawWidthRef.current = drawWidth;

  // ── Collect all committed strokes for rendering ────────────────────────
  const allStrokes = useMemo(() => {
    const strokes: Stroke[] = [];
    for (const el of Object.values(elements)) {
      if (el.type === 'drawing-layer') {
        strokes.push(...el.strokes);
      }
    }
    return strokes;
  }, [elements]);

  // Find or create the global drawing layer element
  const getOrCreateDrawingLayerId = useCallback(() => {
    for (const [id, el] of Object.entries(elements)) {
      if (el.type === 'drawing-layer') return id;
    }
    const id = uuid();
    const drawingLayer: DrawingLayerType = {
      type: 'drawing-layer',
      x: 0,
      y: 0,
      width: 99999,
      height: 99999,
      zOrder: 0,
      strokes: [],
    };
    addElement(id, drawingLayer);
    return id;
  }, [elements, addElement]);

  const handleStrokeComplete = useCallback(
    (stroke: Stroke) => {
      const layerId = getOrCreateDrawingLayerId();
      const layer = elements[layerId] as DrawingLayerType | undefined;
      if (!layer) return;

      updateElement(layerId, {
        strokes: [...layer.strokes, stroke],
      } as Partial<DrawingLayerType>);
    },
    [elements, getOrCreateDrawingLayerId, updateElement],
  );

  // ── Screen → world coordinate conversion ───────────────────────────────
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return [0, 0];
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return [
        (screenX - viewport.x) / viewport.zoom,
        (screenY - viewport.y) / viewport.zoom,
      ];
    },
    [viewport],
  );

  // ── Pen event handling (auto-detected, no mode toggle) ─────────────────
  //
  // Capture phase on the container intercepts pen events before children.
  // - Pen on empty canvas → draw
  // - Pen on a text block → let through (edit text)
  // - Mouse / touch → let through (interact / pan)
  //
  // After setPointerCapture, subsequent move/up events come directly to
  // the container, bypassing children entirely.

  const handlePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      // If pen hits a text block element, let it interact (edit text)
      if ((e.target as HTMLElement).closest('[data-element-id]')) return;

      e.stopPropagation();
      e.preventDefault();

      containerRef.current?.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
      isStrokingRef.current = true;

      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      const pressure = getPressure(e.nativeEvent);

      drawingRef.current?.beginLiveStroke(
        drawColorRef.current,
        drawWidthRef.current,
      );
      drawingRef.current?.addLivePoint(wx, wy, pressure);
    },
    [screenToWorld],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isStrokingRef.current) return;

      e.stopPropagation();
      e.preventDefault();

      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      const pressure = getPressure(e.nativeEvent);

      drawingRef.current?.addLivePoint(wx, wy, pressure);
    },
    [screenToWorld],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isStrokingRef.current) return;

      isStrokingRef.current = false;

      if (containerRef.current && activePointerIdRef.current !== null) {
        containerRef.current.releasePointerCapture(activePointerIdRef.current);
      }
      activePointerIdRef.current = null;

      const points = drawingRef.current?.endLiveStroke();
      if (points && points.length >= 2) {
        const stroke: Stroke = {
          id: uuid(),
          points,
          color: drawColorRef.current,
          width: drawWidthRef.current,
          tool: 'pen',
        };
        handleStrokeComplete(stroke);
      }
    },
    [handleStrokeComplete],
  );

  // ── Viewport culling ───────────────────────────────────────────────────
  const [containerSize, setContainerSize] = useState({
    width: 1920,
    height: 1080,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleIds = useMemo(
    () =>
      getVisibleElementIds(
        elements,
        viewport,
        containerSize.width,
        containerSize.height,
      ),
    [elements, viewport, containerSize.width, containerSize.height],
  );

  // ── Auto-create default text block if canvas is empty ──────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const hasTextBlock = Object.values(elements).some(
      (el) => el.type === 'text-block',
    );
    if (!hasTextBlock) {
      const id = uuid();
      const block = createTextBlock(100, 80, 700, 500);
      addElement(id, block);
    }
  }, [elements, addElement]);

  // ── Double-click to create text block ──────────────────────────────────
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-element-id]')) return;

      const canvasX = (e.clientX - viewport.x) / viewport.zoom;
      const canvasY = (e.clientY - viewport.y) / viewport.zoom;

      const id = uuid();
      const textBlock = createTextBlock(canvasX, canvasY);
      addElement(id, textBlock);
      setSelectedId(id);
    },
    [viewport, addElement],
  );

  // ── Keyboard shortcuts (Delete / Escape) ───────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = document.activeElement;
        if (active && active.closest('.ProseMirror')) return;
        removeElement(selectedId);
        setSelectedId(null);
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, removeElement]);

  // ── Content change handler for text blocks ─────────────────────────────
  const handleContentChange = useCallback(
    (elementId: string, content: Record<string, unknown>) => {
      updateElement(elementId, { content } as Partial<TextBlockType>);
    },
    [updateElement],
  );

  // ── Render visible text blocks in z-order ──────────────────────────────
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const orderedVisible = useMemo(
    () =>
      canvasDoc.zOrder.filter(
        (id) => visibleSet.has(id) && elements[id]?.type === 'text-block',
      ),
    [canvasDoc.zOrder, visibleSet, elements],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full"
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <BackgroundRenderer background={background} zoom={viewport.zoom} />
      <CanvasViewport>
        <div
          onDoubleClick={handleDoubleClick}
          className="absolute inset-0"
          style={{ width: '200%', height: '200%' }}
        >
          {orderedVisible.map((id) => {
            const el = elements[id];
            if (!el || el.type !== 'text-block') return null;

            return (
              <CanvasElement
                key={id}
                id={id}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                selected={selectedId === id}
                onSelect={setSelectedId}
                onDeselect={() => setSelectedId(null)}
                onMove={moveElement}
                onResize={resizeElement}
              >
                <TextBlock
                  elementId={id}
                  content={el.content}
                  onContentChange={handleContentChange}
                />
              </CanvasElement>
            );
          })}
        </div>
      </CanvasViewport>

      {/* Drawing overlay — render-only, no pointer capture */}
      <DrawingLayer
        ref={drawingRef}
        strokes={allStrokes}
        viewport={viewport}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
      />

      {/* Formatting toolbar (shows when a text block has focus) */}
      <CanvasEditorToolbar />

      {/* Drawing tool settings — always visible */}
      <DrawingToolbar
        color={drawColor}
        strokeWidth={drawWidth}
        tool={drawTool}
        onColorChange={setDrawColor}
        onStrokeWidthChange={setDrawWidth}
        onToolChange={setDrawTool}
      />

      {/* Zoom controls */}
      <CanvasToolbar />
    </div>
  );
}
