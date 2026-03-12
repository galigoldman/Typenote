'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import HighlightExt from '@tiptap/extension-highlight';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import type { CanvasPage as CanvasPageData, CanvasTool } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { setupHighDPICanvas } from '@/lib/canvas/coordinate-utils';
import { renderStroke } from '@/lib/canvas/stroke-utils';
import { DEFAULT_ERASER_RADIUS } from '@/hooks/use-eraser';
import type { Editor } from '@tiptap/core';

interface CanvasPageProps {
  page: CanvasPageData;
  activeTool: CanvasTool;
  canvasType?: string;
  onStrokeAdd: (pageId: string, stroke: CanvasPageData['strokes'][0]) => void;
  onStrokeRemove?: (pageId: string, strokeId: string) => void;
  onPointerDown?: (e: React.PointerEvent, pageId: string) => void;
  onPointerMove?: (e: React.PointerEvent, pageId: string) => void;
  onPointerUp?: (e: React.PointerEvent, pageId: string) => void;
  onFlowContentUpdate?: (pageId: string, content: Record<string, unknown>) => void;
  onEditorReady?: (pageId: string, editor: Editor) => void;
  onTextOverflow?: (pageId: string, overflowContent: Record<string, unknown> | null) => void;
  canvasClass?: string;
  eraserPosition?: { x: number; y: number } | null;
  eraserRadius?: number;
  remoteUpdateCounter?: number;
}

export function CanvasPage({
  page,
  activeTool,
  canvasType,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onFlowContentUpdate,
  onEditorReady,
  onTextOverflow,
  canvasClass,
  eraserPosition = null,
  eraserRadius = DEFAULT_ERASER_RADIUS,
  remoteUpdateCounter = 0,
}: CanvasPageProps) {
  const committedCanvasRef = useRef<HTMLCanvasElement>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const committedCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const workingCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overflowNotifiedRef = useRef(false);

  const isInteractionMode = activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'eraser';

  // Setup canvases for high-DPI on mount
  useEffect(() => {
    if (committedCanvasRef.current) {
      committedCtxRef.current = setupHighDPICanvas(
        committedCanvasRef.current,
        PAGE_WIDTH,
        PAGE_HEIGHT,
      );
    }
    if (workingCanvasRef.current) {
      workingCtxRef.current = setupHighDPICanvas(
        workingCanvasRef.current,
        PAGE_WIDTH,
        PAGE_HEIGHT,
      );
    }
  }, []);

  // Native event listeners for pen and touch.
  //
  // PEN (Apple Pencil): Must NEVER scroll. We preventDefault on pointer events
  // AND forcibly set overflow-y:hidden on the scroll container while the pen
  // is down — this is the only reliable way on iPad Safari, where
  // touch-action / preventDefault alone can still let the compositor scroll.
  //
  // FINGER: touch-action:none blocks native scrolling, so we manually scroll
  // via TouchEvent listeners. On iOS, TouchEvent fires only for fingers,
  // never for Apple Pencil, so this cleanly separates the two.
  useEffect(() => {
    const el = interactionLayerRef.current;
    if (!el) return;

    const scrollContainer = el.closest('[data-scroll-container]') as HTMLElement | null;

    // ── Pen handlers ──
    const handlePenDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        e.preventDefault();
        if (scrollContainer) scrollContainer.style.overflowY = 'hidden';
      }
    };

    const handlePenMove = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        e.preventDefault();
      }
    };

    const handlePenEnd = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        e.preventDefault();
        if (scrollContainer) scrollContainer.style.overflowY = 'auto';
      }
    };

    // ── Finger scroll handlers ──
    let touchStartY = 0;
    let scrollStartTop = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !scrollContainer) return;
      touchStartY = e.touches[0].clientY;
      scrollStartTop = scrollContainer.scrollTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !scrollContainer) return;
      const deltaY = touchStartY - e.touches[0].clientY;
      scrollContainer.scrollTop = scrollStartTop + deltaY;
      e.preventDefault();
    };

    el.addEventListener('pointerdown', handlePenDown, { passive: false });
    el.addEventListener('pointermove', handlePenMove, { passive: false });
    el.addEventListener('pointerup', handlePenEnd, { passive: false });
    el.addEventListener('pointercancel', handlePenEnd, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', handlePenDown);
      el.removeEventListener('pointermove', handlePenMove);
      el.removeEventListener('pointerup', handlePenEnd);
      el.removeEventListener('pointercancel', handlePenEnd);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      // Ensure scrolling is restored on unmount
      if (scrollContainer) scrollContainer.style.overflowY = 'auto';
    };
  }, []);

  // TipTap editor for flow content
  const onFlowContentUpdateRef = useRef(onFlowContentUpdate);
  const onEditorReadyRef = useRef(onEditorReady);
  const onTextOverflowRef = useRef(onTextOverflow);
  const pageIdRef = useRef(page.id);
  useEffect(() => {
    onFlowContentUpdateRef.current = onFlowContentUpdate;
    onEditorReadyRef.current = onEditorReady;
    onTextOverflowRef.current = onTextOverflow;
    pageIdRef.current = page.id;
  });

  const editorPaddingTop = canvasType === 'lined' ? 'pt-8' : 'pt-4';

  // Sanitize content: ProseMirror crashes on { type: 'doc', content: [] }
  const safeContent = (() => {
    const fc = page.flowContent as { type?: string; content?: unknown[] } | null;
    if (!fc || !fc.content || fc.content.length === 0) return undefined;
    return fc as Record<string, unknown>;
  })();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline cursor-pointer' },
      }),
      HighlightExt.configure({ multicolor: true }),
      AutoDirection,
    ],
    content: safeContent,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-full ${editorPaddingTop} pb-4 px-4`,
      },
      // Intercept Enter near the bottom of the page → move to next page
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const layer = textLayerRef.current;
          if (!layer) return false;
          try {
            const coords = view.coordsAtPos(view.state.selection.from);
            const layerRect = layer.getBoundingClientRect();
            const cursorY = coords.bottom - layerRect.top;
            // If the cursor is within ~60px of the page bottom, there's no
            // room for a new paragraph — move to the next page instead.
            if (cursorY > PAGE_HEIGHT - 60) {
              event.preventDefault();
              onTextOverflowRef.current?.(pageIdRef.current, null);
              return true;
            }
          } catch { /* coordsAtPos can throw before DOM is ready */ }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onFlowContentUpdateRef.current?.(
        pageIdRef.current,
        ed.getJSON() as Record<string, unknown>,
      );

      // Fallback overflow detection for paste / bulk-insert that pushes
      // the cursor past the page boundary (uses cursor position, not
      // scrollHeight, to avoid false positives from CSS margins).
      requestAnimationFrame(() => {
        const layer = textLayerRef.current;
        if (!layer || overflowNotifiedRef.current) return;
        try {
          const coords = ed.view.coordsAtPos(ed.state.selection.from);
          const layerRect = layer.getBoundingClientRect();
          const cursorY = coords.bottom - layerRect.top;

          if (cursorY > PAGE_HEIGHT) {
            overflowNotifiedRef.current = true;
            // Extract the last block node and move it to the new page
            const { doc } = ed.state;
            if (doc.childCount > 1) {
              const lastChild = doc.lastChild!;
              const lastNodeJson = lastChild.toJSON();
              const nodeFrom = doc.content.size - lastChild.nodeSize;
              const nodeTo = doc.content.size;
              ed.chain().deleteRange({ from: nodeFrom, to: nodeTo }).run();
              onTextOverflowRef.current?.(pageIdRef.current, {
                type: 'doc',
                content: [lastNodeJson],
              } as Record<string, unknown>);
            } else {
              onTextOverflowRef.current?.(pageIdRef.current, null);
            }
          } else if (cursorY < PAGE_HEIGHT - 100) {
            // Reset only when cursor is well within the page
            overflowNotifiedRef.current = false;
          }
        } catch { /* coordsAtPos can throw before DOM is ready */ }
      });
    },
    onFocus: ({ editor: ed }) => {
      onEditorReadyRef.current?.(pageIdRef.current, ed);
    },
  });

  // Notify parent when editor is created
  useEffect(() => {
    if (editor) {
      onEditorReadyRef.current?.(pageIdRef.current, editor);
    }
  }, [editor]);

  // Sync editor content on remote updates
  const prevRemoteCounterRef = useRef(remoteUpdateCounter);
  useEffect(() => {
    if (remoteUpdateCounter !== prevRemoteCounterRef.current) {
      prevRemoteCounterRef.current = remoteUpdateCounter;
      if (editor && page.flowContent) {
        const fc = page.flowContent as { type?: string; content?: unknown[] };
        if (fc?.content && fc.content.length > 0) {
          editor.commands.setContent(page.flowContent as Record<string, unknown>, { emitUpdate: false });
        }
      }
    }
  }, [remoteUpdateCounter, editor, page.flowContent]);

  // Re-render committed strokes when page.strokes changes
  const renderCommittedStrokes = useCallback(() => {
    const ctx = committedCtxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    for (const stroke of page.strokes) {
      renderStroke(ctx, stroke.points, {
        color: stroke.color,
        size: stroke.width,
        opacity: stroke.opacity ?? 1,
      });
    }
  }, [page.strokes]);

  useEffect(() => {
    renderCommittedStrokes();
  }, [renderCommittedStrokes]);

  const handlePointerDown = (e: React.PointerEvent) => {
    onPointerDown?.(e, page.id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    onPointerMove?.(e, page.id);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    onPointerUp?.(e, page.id);
  };

  return (
    <div
      className="relative bg-white shadow-md mx-auto"
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Layer 1: Page background */}
      <div
        className={`absolute inset-0 ${canvasClass ?? ''}`}
        style={{ pointerEvents: 'none' }}
      />

      {/* Layer 2: Committed canvas */}
      <canvas
        ref={committedCanvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      />

      {/* Layer 3: Working canvas */}
      <canvas
        ref={workingCanvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      />

      {/* Layer 4: Text content layer — only interactive in text mode */}
      <div
        ref={textLayerRef}
        className="absolute inset-0 overflow-hidden"
        style={{ pointerEvents: isInteractionMode ? 'none' : 'auto' }}
      >
        {editor && <EditorContent editor={editor} />}
      </div>

      {/* Layer 5: Eraser cursor circle */}
      {eraserPosition && (
        <svg
          className="absolute inset-0"
          viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
          style={{ pointerEvents: 'none' }}
        >
          <circle
            cx={eraserPosition.x}
            cy={eraserPosition.y}
            r={eraserRadius}
            fill="rgba(255, 255, 255, 0.5)"
            stroke="#888888"
            strokeWidth={1}
          />
        </svg>
      )}

      {/* Layer 6: Interaction layer — ALWAYS present
          In draw/erase mode: captures all events (pointer-events: auto)
          In text mode: transparent (pointer-events: none), lets clicks reach editor */}
      <div
        ref={interactionLayerRef}
        className="absolute inset-0"
        style={{
          touchAction: isInteractionMode ? 'none' : 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: isInteractionMode ? 'auto' : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
