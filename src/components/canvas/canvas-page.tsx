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
import { Indent } from '@/lib/editor/indent-extension';
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
  onFlowContentUpdate?: (
    pageId: string,
    content: Record<string, unknown>,
  ) => void;
  onEditorReady?: (pageId: string, editor: Editor) => void;
  onTextOverflow?: (
    pageId: string,
    overflowContent: Record<string, unknown> | null,
  ) => void;
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
  const isSplittingRef = useRef(false);

  const isInteractionMode =
    activeTool === 'pen' ||
    activeTool === 'highlighter' ||
    activeTool === 'eraser';

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
  // FINGER scroll: In Draw/Eraser mode the scroll container has overflow:hidden
  // (set by canvas-editor), so native scrolling is blocked. We manually scroll
  // via TouchEvent listeners. On iOS, TouchEvent fires only for fingers, never
  // for Apple Pencil, so this cleanly separates pen drawing from finger scrolling.
  useEffect(() => {
    const el = interactionLayerRef.current;
    if (!el) return;

    const scrollContainer = el.closest(
      '[data-scroll-container]',
    ) as HTMLElement | null;

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

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
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
    const fc = page.flowContent as {
      type?: string;
      content?: unknown[];
    } | null;
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
      Indent,
    ],
    content: safeContent,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-full ${editorPaddingTop} pb-4 px-4`,
      },
      // Intercept Enter / ArrowDown near the bottom → move to next page
      handleKeyDown: (view, event) => {
        // Enter near bottom → move to next page
        if (event.key === 'Enter' && !event.shiftKey) {
          const layer = textLayerRef.current;
          if (!layer) return false;
          try {
            const coords = view.coordsAtPos(view.state.selection.from);
            const layerRect = layer.getBoundingClientRect();
            const cursorY = coords.bottom - layerRect.top;
            if (cursorY > PAGE_HEIGHT - 60) {
              event.preventDefault();
              view.dom.blur();
              onTextOverflowRef.current?.(pageIdRef.current, null);
              return true;
            }
          } catch {
            /* coordsAtPos can throw before DOM is ready */
          }
        }

        // ArrowDown at end of content near page bottom → next page
        if (event.key === 'ArrowDown') {
          const { state } = view;
          const endPos = state.doc.content.size - 1;
          if (state.selection.from >= endPos) {
            const layer = textLayerRef.current;
            if (!layer) return false;
            try {
              const coords = view.coordsAtPos(state.selection.from);
              const layerRect = layer.getBoundingClientRect();
              const cursorY = coords.bottom - layerRect.top;
              if (cursorY > PAGE_HEIGHT * 0.8) {
                event.preventDefault();
                view.dom.blur();
                onTextOverflowRef.current?.(pageIdRef.current, null);
                return true;
              }
            } catch {
              /* coordsAtPos can throw before DOM is ready */
            }
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Suppress content saves during split operations to avoid
      // persisting intermediate states
      if (!isSplittingRef.current) {
        onFlowContentUpdateRef.current?.(
          pageIdRef.current,
          ed.getJSON() as Record<string, unknown>,
        );
      }

      // Auto-scroll to keep cursor visible while typing (like Word/Docs).
      // Only runs in text mode — must not fire during drawing or it shifts
      // the page position and causes jagged strokes.
      if (!isSplittingRef.current && activeTool === 'text') {
        requestAnimationFrame(() => {
          const layer = textLayerRef.current;
          if (!layer) return;
          try {
            const coords = ed.view.coordsAtPos(ed.state.selection.from);
            const scrollContainer = layer.closest(
              '[data-scroll-container]',
            ) as HTMLElement | null;
            if (!scrollContainer) return;
            const containerRect = scrollContainer.getBoundingClientRect();
            const margin = 100;
            if (coords.bottom > containerRect.bottom - margin) {
              scrollContainer.scrollBy({
                top: coords.bottom - containerRect.bottom + margin,
              });
            }
          } catch {
            /* coordsAtPos can throw */
          }
        });
      }

      // Overflow detection — runs after every edit to check if the
      // cursor has pushed past the page boundary.
      requestAnimationFrame(() => {
        const layer = textLayerRef.current;
        if (!layer || overflowNotifiedRef.current) return;
        try {
          const coords = ed.view.coordsAtPos(ed.state.selection.from);
          const layerRect = layer.getBoundingClientRect();
          const cursorY = coords.bottom - layerRect.top;

          if (cursorY > PAGE_HEIGHT) {
            overflowNotifiedRef.current = true;
            const { doc } = ed.state;

            if (doc.childCount > 1) {
              // Multi-block: extract the last block node
              const lastChild = doc.lastChild!;
              const lastNodeJson = lastChild.toJSON();
              const nodeFrom = doc.content.size - lastChild.nodeSize;
              const nodeTo = doc.content.size;
              ed.chain().deleteRange({ from: nodeFrom, to: nodeTo }).run();
              ed.commands.blur();
              onTextOverflowRef.current?.(pageIdRef.current, {
                type: 'doc',
                content: [lastNodeJson],
              } as Record<string, unknown>);
            } else {
              // Single block: split at page boundary word break
              const bottomY = layerRect.top + PAGE_HEIGHT - 20;
              const posInfo = ed.view.posAtCoords({
                left: layerRect.left + PAGE_WIDTH / 2,
                top: bottomY,
              });

              if (posInfo && posInfo.pos > 2) {
                let splitPos = posInfo.pos;

                // Walk backward to find a word boundary (space)
                const $pos = doc.resolve(splitPos);
                const text = $pos.parent.textContent;
                const offset = $pos.parentOffset;
                let wordBreak = offset;
                while (wordBreak > 0 && text[wordBreak - 1] !== ' ') {
                  wordBreak--;
                }
                if (wordBreak > 0) {
                  splitPos = $pos.start() + wordBreak;
                }

                // Split the block, then extract the second half
                isSplittingRef.current = true;
                ed.chain().setTextSelection(splitPos).splitBlock().run();

                const newDoc = ed.state.doc;
                const overflowNodes: unknown[] = [];
                for (let i = 1; i < newDoc.childCount; i++) {
                  overflowNodes.push(newDoc.child(i).toJSON());
                }

                const firstBlockEnd = newDoc.child(0).nodeSize;
                ed.chain()
                  .deleteRange({
                    from: firstBlockEnd,
                    to: newDoc.content.size,
                  })
                  .run();

                isSplittingRef.current = false;

                // Manually save the final state (intermediate was suppressed)
                onFlowContentUpdateRef.current?.(
                  pageIdRef.current,
                  ed.getJSON() as Record<string, unknown>,
                );

                ed.commands.blur();
                onTextOverflowRef.current?.(pageIdRef.current, {
                  type: 'doc',
                  content: overflowNodes,
                } as Record<string, unknown>);
              } else {
                // Can't determine split position — just navigate
                ed.commands.blur();
                onTextOverflowRef.current?.(pageIdRef.current, null);
              }
            }
          } else if (cursorY < PAGE_HEIGHT - 100) {
            overflowNotifiedRef.current = false;
          }
        } catch {
          /* coordsAtPos can throw before DOM is ready */
        }
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

  // In Draw/Eraser mode the TipTap editor must be non-editable. This prevents
  // iPadOS Scribble from converting pen strokes into text.
  useEffect(() => {
    if (!editor) return;
    const shouldBeEditable = activeTool === 'text';
    if (editor.isEditable !== shouldBeEditable) {
      editor.setEditable(shouldBeEditable);
    }
  }, [activeTool, editor]);

  // Sync editor content on remote updates
  const prevRemoteCounterRef = useRef(remoteUpdateCounter);
  useEffect(() => {
    if (remoteUpdateCounter !== prevRemoteCounterRef.current) {
      prevRemoteCounterRef.current = remoteUpdateCounter;
      if (editor && page.flowContent) {
        const fc = page.flowContent as { type?: string; content?: unknown[] };
        if (fc?.content && fc.content.length > 0) {
          editor.commands.setContent(
            page.flowContent as Record<string, unknown>,
            { emitUpdate: false },
          );
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
