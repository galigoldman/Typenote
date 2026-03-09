'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import type { CanvasPage as CanvasPageData, CanvasTool } from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { setupHighDPICanvas } from '@/lib/canvas/coordinate-utils';
import { renderStroke } from '@/lib/canvas/stroke-utils';
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
  onEditorReady?: (editor: Editor) => void;
  canvasClass?: string;
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
  canvasClass,
}: CanvasPageProps) {
  const committedCanvasRef = useRef<HTMLCanvasElement>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const committedCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const workingCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const isDrawMode = activeTool === 'pen' || activeTool === 'eraser';

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

  // Native event listeners — exact same approach as working commit
  // ALWAYS on the interaction layer, prevents text selection and touch defaults
  useEffect(() => {
    const el = interactionLayerRef.current;
    if (!el) return;

    const preventForPen = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        e.preventDefault();
      }
    };

    const preventTouch = (e: TouchEvent) => {
      e.preventDefault();
    };

    el.addEventListener('pointerdown', preventForPen, { passive: false });
    el.addEventListener('pointermove', preventForPen, { passive: false });
    el.addEventListener('pointerup', preventForPen, { passive: false });
    el.addEventListener('touchstart', preventTouch, { passive: false });
    el.addEventListener('touchmove', preventTouch, { passive: false });
    el.addEventListener('touchend', preventTouch, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', preventForPen);
      el.removeEventListener('pointermove', preventForPen);
      el.removeEventListener('pointerup', preventForPen);
      el.removeEventListener('touchstart', preventTouch);
      el.removeEventListener('touchmove', preventTouch);
      el.removeEventListener('touchend', preventTouch);
    };
  }, []);

  // TipTap editor for flow content
  const onFlowContentUpdateRef = useRef(onFlowContentUpdate);
  onFlowContentUpdateRef.current = onFlowContentUpdate;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const pageIdRef = useRef(page.id);
  pageIdRef.current = page.id;

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
      AutoDirection,
    ],
    content: safeContent,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-full ${editorPaddingTop} pb-4 px-4`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      onFlowContentUpdateRef.current?.(
        pageIdRef.current,
        ed.getJSON() as Record<string, unknown>,
      );
    },
    onFocus: ({ editor: ed }) => {
      onEditorReadyRef.current?.(ed);
    },
  });

  // Notify parent when editor is created
  useEffect(() => {
    if (editor) {
      onEditorReadyRef.current?.(editor);
    }
  }, [editor]);

  // Re-render committed strokes when page.strokes changes
  const renderCommittedStrokes = useCallback(() => {
    const ctx = committedCtxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    for (const stroke of page.strokes) {
      renderStroke(ctx, stroke.points, {
        color: stroke.color,
        size: stroke.width,
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
        marginBottom: 20,
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

      {/* Layer 4: Text content layer — only interactive in type mode */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ pointerEvents: isDrawMode ? 'none' : 'auto' }}
      >
        {editor && <EditorContent editor={editor} />}
      </div>

      {/* Layer 5: Interaction layer — ALWAYS present
          In draw mode: captures all events (pointer-events: auto)
          In type mode: transparent (pointer-events: none), lets clicks reach editor */}
      <div
        ref={interactionLayerRef}
        className="absolute inset-0"
        style={{
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: isDrawMode ? 'auto' : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
