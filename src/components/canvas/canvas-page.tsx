'use client';

import { createPortal } from 'react-dom';
import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import HighlightExt from '@tiptap/extension-highlight';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import { TextStyle } from '@tiptap/extension-text-style';
import { Indent } from '@/lib/editor/indent-extension';
import { FontSize } from '@/lib/editor/font-size-extension';
import { MathExpression } from '@/lib/editor/math-extension';
import { Pencil, Sparkles, Trash2, X, Copy, Check } from 'lucide-react';
import { PdfTextLayer } from './pdf-text-layer';
import { findOverflowSplitIndex } from '@/lib/canvas/text-split';
import type {
  CanvasPage as CanvasPageData,
  CanvasTool,
  BBox,
} from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import { setupHighDPICanvas } from '@/lib/canvas/coordinate-utils';
import { renderStroke } from '@/lib/canvas/stroke-utils';
import { DEFAULT_ERASER_RADIUS } from '@/hooks/use-eraser';
import { SelectionOverlay } from './selection-overlay';
import { TextBox as TextBoxComponent } from './text-box';
import type { Editor } from '@tiptap/core';

/** Small Copy button with "Copied!" feedback for the floating action bar */
function CopyButton({ onCopy }: { onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.PointerEvent) => {
    e.stopPropagation();
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onPointerDown={handleCopy}
      className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors text-gray-600"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

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
  onEditorReady?: (pageId: string, editor: Editor, textBoxId?: string) => void;
  onTextOverflow?: (
    pageId: string,
    overflowContent: Record<string, unknown> | null,
  ) => void;
  canvasClass?: string;
  eraserPosition?: { x: number; y: number } | null;
  eraserRadius?: number;
  remoteUpdateCounter?: number;
  selectionPath?: [number, number][] | null;
  isRectMode?: boolean;
  selectionBBox?: BBox | null;
  tightSelectionBBox?: BBox | null;
  isSelectionDragging?: boolean;
  selectionDragOffset?: { x: number; y: number };
  isSelectionResizing?: boolean;
  selectionResizeBBox?: BBox | null;
  selectedStrokeIds?: Set<string>;
  selectedTextBoxIds?: Set<string>;
  onTextBoxContentUpdate?: (
    pageId: string,
    textBoxId: string,
    content: Record<string, unknown>,
  ) => void;
  onTextBoxHeightMeasured?: (
    pageId: string,
    textBoxId: string,
    height: number,
  ) => void;
  onTextBoxContentBoundsMeasured?: (
    pageId: string,
    textBoxId: string,
    bounds: { offsetX: number; width: number } | undefined,
  ) => void;
  onDeleteSelection?: () => void;
  onEditSelection?: () => void;
  onCopySelection?: () => void;
  longPressIndicator?: { x: number; y: number; isVisible: boolean };
  hasSelectedTextBoxes?: boolean;
  renderPdfPage?: (pageNum: number, canvas: HTMLCanvasElement) => Promise<void>;
  materialId?: string | null;
  personalFileId?: string | null;
  onBackspaceAtStart?: (pageId: string, textBoxId: string) => void;
  onAskAiWithText?: (text: string) => void;
  onAskAiWithRegion?: (bbox: BBox, pageId: string) => void;
  onImageSelect?: (pageId: string, imageId: string) => void;
  onCanvasRefsReady?: (
    pageId: string,
    pdfCanvas: HTMLCanvasElement | null,
    strokesCanvas: HTMLCanvasElement | null,
    pageElement: HTMLDivElement | null,
  ) => void;
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
  selectionPath = null,
  isRectMode = true,
  selectionBBox = null,
  tightSelectionBBox = null,
  isSelectionDragging = false,
  selectionDragOffset = { x: 0, y: 0 },
  isSelectionResizing = false,
  selectionResizeBBox = null,
  selectedStrokeIds = new Set<string>(),
  selectedTextBoxIds = new Set<string>(),
  onTextBoxContentUpdate,
  onTextBoxHeightMeasured,
  onTextBoxContentBoundsMeasured,
  onDeleteSelection,
  onEditSelection,
  onCopySelection,
  longPressIndicator,
  hasSelectedTextBoxes = false,
  renderPdfPage,
  materialId,
  personalFileId,
  onBackspaceAtStart,
  onAskAiWithText,
  onAskAiWithRegion,
  onImageSelect,
  onCanvasRefsReady,
}: CanvasPageProps) {
  const pageRootRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const committedCanvasRef = useRef<HTMLCanvasElement>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const committedCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const workingCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overflowNotifiedRef = useRef(false);
  const isSplittingRef = useRef(false);

  // Crop tool state: draw a rectangle to screenshot
  const [cropRect, setCropRect] = useState<BBox | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleCropPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (activeTool !== 'crop' || e.pointerType === 'touch') return;
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      cropStartRef.current = { x, y };
      setIsCropping(true);
      setCropRect(null);
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [activeTool],
  );

  const handleCropPointerMove = useCallback((e: React.PointerEvent) => {
    if (!cropStartRef.current) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const s = cropStartRef.current;
    setCropRect({
      minX: Math.min(s.x, x),
      minY: Math.min(s.y, y),
      maxX: Math.max(s.x, x),
      maxY: Math.max(s.y, y),
    });
  }, []);

  const handleCropPointerUp = useCallback(() => {
    setIsCropping(false);
    cropStartRef.current = null;
    // Keep cropRect visible so user can click "Ask AI"
  }, []);

  const handleCropAskAi = useCallback(() => {
    if (!cropRect || !onAskAiWithRegion) return;
    onAskAiWithRegion(cropRect, page.id);
    setCropRect(null);
  }, [cropRect, onAskAiWithRegion, page.id]);

  // Clear crop rect when switching away from crop tool
  useEffect(() => {
    if (activeTool !== 'crop') {
      setCropRect(null);
    }
  }, [activeTool]);

  // Track text selection state for floating action bar (Read tool)
  const selectedTextRef = useRef<string>('');
  const selectedRectRef = useRef<DOMRect | null>(null);
  const [textSelectionRect, setTextSelectionRect] = useState<DOMRect | null>(
    null,
  );

  const handleTextSelected = useCallback(
    (text: string, rect: DOMRect | null) => {
      selectedTextRef.current = text;
      selectedRectRef.current = rect;
      setTextSelectionRect(text ? rect : null);
    },
    [],
  );

  // Listen for text selection in text boxes (Read mode on non-PDF docs)
  useEffect(() => {
    if (activeTool !== 'read') return;
    // Skip if this page has a PDF text layer (PdfTextLayer handles selection)
    if (page.pdfPage != null && (materialId || personalFileId)) return;

    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        handleTextSelected('', null);
        return;
      }
      const range = sel.getRangeAt(0);
      const layer = textLayerRef.current;
      if (!layer || !layer.contains(range.commonAncestorContainer)) return;

      const text = sel.toString().trim();
      if (text) {
        handleTextSelected(text, range.getBoundingClientRect());
      } else {
        handleTextSelected('', null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', handleSelectionChange);
  }, [
    activeTool,
    page.pdfPage,
    materialId,
    personalFileId,
    handleTextSelected,
  ]);

  const isInteractionMode =
    activeTool === 'pen' ||
    activeTool === 'highlighter' ||
    activeTool === 'eraser' ||
    activeTool === 'select';

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

  // Expose canvas refs to parent for region capture
  useEffect(() => {
    onCanvasRefsReady?.(
      page.id,
      pdfCanvasRef.current,
      committedCanvasRef.current,
      pageRootRef.current,
    );
  }, [page.id, onCanvasRefsReady]);

  // Render PDF background when pdfPage is set
  useEffect(() => {
    const canvas = pdfCanvasRef.current;
    if (canvas == null || page.pdfPage == null || !renderPdfPage) return;
    renderPdfPage(page.pdfPage, canvas);
  }, [page.pdfPage, renderPdfPage]);

  // Finger scroll in draw/erase modes is handled by the camera model
  // in use-pinch-zoom.ts at the container level. On iOS, TouchEvent fires
  // only for fingers (not Apple Pencil), so the container-level handler
  // cleanly separates pen drawing from finger panning.

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
      TextStyle,
      FontSize,
      AutoDirection,
      Indent,
      MathExpression,
    ],
    content: safeContent,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-full ${editorPaddingTop} pb-4 px-4`,
      },
      // Intercept ArrowDown near the bottom → move to next page
      handleKeyDown: (view, event) => {
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
      // Only runs when THIS editor has focus — otherwise cascade-driven
      // setContent on a downstream page's flow editor would scroll the
      // viewport away from the user's actual typing position (the bug
      // that caused "every Enter jumps to the last page").
      if (!isSplittingRef.current && activeTool === 'text' && ed.isFocused) {
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

      // Overflow detection — runs after every edit to check if content
      // extends past the page boundary. Measures the BOTTOM of the last
      // block child of the editor DOM, so the gate and the per-block split
      // index use the exact same coordinate system (both ignore the editor's
      // own padding-bottom, which caused a stuck-gate bug previously).
      //
      // The `overflowNotifiedRef` is held for exactly the synchronous body
      // of this rAF callback and always released in the `finally` block.
      // That guarantees the gate cannot get stuck on any no-op branch,
      // which is what made Type-mode reflow unreliable in issue #118.
      requestAnimationFrame(() => {
        const layer = textLayerRef.current;
        if (!layer) return;
        if (overflowNotifiedRef.current) return;
        overflowNotifiedRef.current = true;
        try {
          const editorDom = ed.view.dom as HTMLElement;
          const domChildren = editorDom.children;
          const lastChild = domChildren[domChildren.length - 1] as
            | HTMLElement
            | undefined;
          // Measure via offsetTop + offsetHeight of the last block. This is
          // unaffected by the text layer's `overflow: hidden` clipping AND
          // by the editor's own padding-bottom, so the measurement agrees
          // with the per-block loop below.
          const contentBottom = lastChild
            ? lastChild.offsetTop + lastChild.offsetHeight
            : 0;

          if (contentBottom <= PAGE_HEIGHT) {
            return;
          }

          const { doc } = ed.state;

          // Try the multi-block split path first. It is valid only when:
          //   (a) the doc has more than one block, AND
          //   (b) `findOverflowSplitIndex` returns a non-null index, i.e.
          //       block 0 still fits on the current page so trailing blocks
          //       can be cleanly moved to the next page.
          // If block 0 is itself too tall (returns null despite multi-block),
          // we fall through to the single-block word-boundary path, which
          // can actually relieve the overflow by splitting inside block 0.
          let splitIdx: number | null = null;
          if (doc.childCount > 1) {
            const blockBottoms: number[] = [];
            for (let i = 0; i < doc.childCount; i++) {
              const el = domChildren[i] as HTMLElement | undefined;
              if (el) {
                blockBottoms.push(el.offsetTop + el.offsetHeight);
              } else {
                blockBottoms.push(Infinity);
              }
            }
            splitIdx = findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT);
          }

          if (splitIdx !== null && splitIdx < doc.childCount) {
            // Multi-block path — move trailing blocks [splitIdx..end) to the
            // next page. Block 0 (and blocks before splitIdx) stays here.
            const overflowNodes: unknown[] = [];
            for (let i = splitIdx; i < doc.childCount; i++) {
              overflowNodes.push(doc.child(i).toJSON());
            }

            let deleteFrom = 0;
            for (let i = 0; i < splitIdx; i++) {
              deleteFrom += doc.child(i).nodeSize;
            }

            ed.chain()
              .deleteRange({ from: deleteFrom, to: doc.content.size })
              .run();
            // Don't blur — let ProseMirror's selection mapping keep
            // the cursor at the edge of the remaining content (same
            // approach as the -ftb text box overflow path).

            onTextOverflowRef.current?.(pageIdRef.current, {
              type: 'doc',
              content: overflowNodes,
            } as Record<string, unknown>);
          } else {
            // Single-block path — either doc.childCount === 1, or block 0 is
            // itself taller than the page (see the fall-through above). In
            // both cases we split at a word boundary near the page bottom
            // inside block 0. The resulting overflow includes the second
            // half of block 0 AND any blocks that were already after it.
            const layerRect = layer.getBoundingClientRect();
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

              // Split the block, then extract everything after the first
              // (kept) block as overflow.
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

              // Don't blur — cursor stays via selection mapping.

              onTextOverflowRef.current?.(pageIdRef.current, {
                type: 'doc',
                content: overflowNodes,
              } as Record<string, unknown>);
            } else {
              // Can't determine split position — navigate to next page
              onTextOverflowRef.current?.(pageIdRef.current, null);
            }
          }
        } catch {
          /* DOM measurements can throw before editor is ready */
        } finally {
          // Always release the gate. This is the fix for issue #118's core
          // "stuck overflow" bug: previously the gate stayed set on several
          // no-op branches, silently disabling overflow detection until the
          // user deleted enough content to cross a hysteresis threshold.
          overflowNotifiedRef.current = false;
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
  // preventScroll avoids the page jumping when switching to text mode.
  useEffect(() => {
    if (!editor) return;
    const shouldBeEditable = activeTool === 'text';
    if (editor.isEditable !== shouldBeEditable) {
      const scrollContainer = interactionLayerRef.current?.closest(
        '[data-scroll-container]',
      ) as HTMLElement | null;
      const scrollTop = scrollContainer?.scrollTop ?? 0;
      editor.setEditable(shouldBeEditable);
      // Restore scroll position after editable change
      if (scrollContainer) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollTop;
        });
      }
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

  // Re-render committed strokes when page.strokes changes.
  // During drag, selected strokes are hidden here and drawn at offset on the working canvas.
  const renderCommittedStrokes = useCallback(() => {
    const ctx = committedCtxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    for (const stroke of page.strokes) {
      // Skip selected strokes during drag — they're rendered on working canvas at offset
      if (isSelectionDragging && selectedStrokeIds.has(stroke.id)) continue;
      renderStroke(ctx, stroke.points, {
        color: stroke.color,
        size: stroke.width,
        opacity: stroke.opacity ?? 1,
      });
    }
  }, [page.strokes, isSelectionDragging, selectedStrokeIds]);

  // Render selected strokes at drag offset on the working canvas
  useEffect(() => {
    const ctx = workingCtxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    if (!isSelectionDragging || selectedStrokeIds.size === 0) return;
    const dx = selectionDragOffset.x;
    const dy = selectionDragOffset.y;
    for (const stroke of page.strokes) {
      if (!selectedStrokeIds.has(stroke.id)) continue;
      const offsetPoints = stroke.points.map(
        ([px, py, pressure]) =>
          [px + dx, py + dy, pressure] as [number, number, number],
      );
      renderStroke(ctx, offsetPoints, {
        color: stroke.color,
        size: stroke.width,
        opacity: stroke.opacity ?? 1,
      });
    }
  }, [
    isSelectionDragging,
    selectedStrokeIds,
    selectionDragOffset,
    page.strokes,
  ]);

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
      ref={pageRootRef}
      className="relative bg-white shadow-md mx-auto pointer-touch:shadow-none"
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Layer 0: PDF background (material-backed documents only) */}
      {page.pdfPage != null && (
        <canvas
          ref={pdfCanvasRef}
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
        />
      )}

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

      {/* Layer 3.5: Pasted images — above strokes, below text (visual only) */}
      {(page.images ?? []).map((img) => (
        <img
          key={img.id}
          src={img.src}
          alt=""
          draggable={false}
          className="absolute"
          style={{
            left: img.x,
            top: img.y,
            width: img.width,
            height: img.height,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Layer 4: Text content layer — only interactive in text mode.
          MUST clip (overflow-hidden): this is the page-level guard that hides
          any text spilling past the page edge before the overflow handler
          reflows it to the next page. LaTeX bubble menus / edit panels and the
          Read-mode Ask AI bar escape this clip via React portals to
          document.body (see math-node-view.tsx), so clipping here does not
          re-introduce the menu-clipping issue that abbe925 was fixing. */}
      <div
        ref={textLayerRef}
        data-text-layer
        className="absolute inset-0 overflow-hidden"
        style={{
          pointerEvents:
            isInteractionMode ||
            (activeTool === 'read' &&
              page.pdfPage != null &&
              !!(materialId || personalFileId))
              ? 'none'
              : 'auto',
          userSelect: activeTool === 'read' ? 'text' : undefined,
          WebkitUserSelect: activeTool === 'read' ? 'text' : undefined,
        }}
      >
        {/* Flow editor — hidden when page has text boxes (text was migrated) */}
        {editor && page.textBoxes.length === 0 && (
          <EditorContent editor={editor} />
        )}
        {/* Render text boxes */}
        {page.textBoxes.map((tb) => (
          <TextBoxComponent
            key={tb.id}
            textBox={tb}
            maxHeight={
              tb.id.endsWith('-ftb') ? PAGE_HEIGHT - tb.y - 40 : undefined
            }
            isSelected={selectedTextBoxIds.has(tb.id)}
            readOnly={activeTool === 'read'}
            onContentUpdate={(id, content) =>
              onTextBoxContentUpdate?.(page.id, id, content)
            }
            onEditorReady={(ed) => onEditorReady?.(page.id, ed, tb.id)}
            onHeightMeasured={(id, height) =>
              onTextBoxHeightMeasured?.(page.id, id, height)
            }
            onContentBoundsMeasured={(id, bounds) =>
              onTextBoxContentBoundsMeasured?.(page.id, id, bounds)
            }
            onBackspaceAtStart={() => onBackspaceAtStart?.(page.id, tb.id)}
          />
        ))}
      </div>

      {/* Layer 4.1: Image click targets — above text layer so images are clickable in type/read mode */}
      {(activeTool === 'text' || activeTool === 'read') &&
        (page.images ?? []).map((img) => (
          <div
            key={`img-click-${img.id}`}
            className="absolute"
            style={{
              left: img.x,
              top: img.y,
              width: img.width,
              height: img.height,
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onImageSelect?.(page.id, img.id);
            }}
          />
        ))}

      {/* Layer 4.5: PDF text layer (Read tool) — above text content so it's selectable */}
      {page.pdfPage != null && (materialId || personalFileId) && (
        <PdfTextLayer
          pdfPage={page.pdfPage}
          materialId={materialId ?? null}
          personalFileId={personalFileId ?? null}
          isActive={activeTool === 'read'}
          onTextSelected={handleTextSelected}
        />
      )}

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

      {/* Layer 5.4: Paste long-press indicator */}
      {longPressIndicator?.isVisible && (
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
          style={{ zIndex: 9 }}
        >
          <circle
            cx={longPressIndicator.x}
            cy={longPressIndicator.y}
            r="0"
            fill="rgba(59, 130, 246, 0.2)"
            stroke="rgba(59, 130, 246, 0.5)"
            strokeWidth="1.5"
          >
            <animate
              attributeName="r"
              from="0"
              to="20"
              dur="0.5s"
              fill="freeze"
            />
          </circle>
        </svg>
      )}

      {/* Layer 5.5: Selection overlay */}
      {activeTool === 'select' && (
        <SelectionOverlay
          selectionPath={selectionPath}
          isRectMode={isRectMode}
          selectionBBox={selectionBBox}
          tightSelectionBBox={tightSelectionBBox}
          isDragging={isSelectionDragging}
          dragOffset={selectionDragOffset}
          isResizing={isSelectionResizing}
          resizeBBox={selectionResizeBBox}
        />
      )}

      {/* Layer 5.6: Floating action bar above selection */}
      {activeTool === 'select' &&
        selectionBBox &&
        !isSelectionDragging &&
        !isSelectionResizing && (
          <div
            className="absolute flex items-center gap-1 bg-white rounded-full shadow-lg border px-2 py-1"
            style={{
              left: (selectionBBox.minX + selectionBBox.maxX) / 2,
              top: selectionBBox.minY - 40,
              transform: 'translateX(-50%)',
              pointerEvents: 'auto',
              zIndex: 10,
            }}
          >
            {hasSelectedTextBoxes && (
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onEditSelection?.();
                }}
                className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-gray-100 transition-colors text-gray-600"
                title="Edit text"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onCopySelection && <CopyButton onCopy={onCopySelection} />}
            {onAskAiWithRegion && selectionBBox && (
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onAskAiWithRegion(selectionBBox, page.id);
                }}
                className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-purple-50 hover:text-purple-600 transition-colors text-gray-600"
                title="Ask AI about selection"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onDeleteSelection?.();
              }}
              className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors text-gray-600"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

      {/* Layer 5.7: Crop tool overlay + interaction */}
      {activeTool === 'crop' && (
        <div
          className="absolute inset-0"
          style={{
            pointerEvents: 'auto',
            cursor: 'crosshair',
            touchAction: 'none',
            zIndex: 8,
          }}
          onPointerDown={handleCropPointerDown}
          onPointerMove={handleCropPointerMove}
          onPointerUp={handleCropPointerUp}
        >
          {/* Crop rectangle */}
          {cropRect && (
            <svg
              className="absolute inset-0"
              viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
              style={{ pointerEvents: 'none' }}
            >
              <rect
                x={cropRect.minX}
                y={cropRect.minY}
                width={cropRect.maxX - cropRect.minX}
                height={cropRect.maxY - cropRect.minY}
                fill="rgba(139, 92, 246, 0.08)"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            </svg>
          )}
          {/* Floating "Ask AI" button above crop rect */}
          {cropRect &&
            !isCropping &&
            cropRect.maxX - cropRect.minX > 20 &&
            cropRect.maxY - cropRect.minY > 20 && (
              <div
                className="absolute flex items-center gap-1 bg-white rounded-full shadow-lg border px-2 py-1"
                style={{
                  left: (cropRect.minX + cropRect.maxX) / 2,
                  top: cropRect.minY - 40,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'auto',
                  zIndex: 10,
                }}
              >
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleCropAskAi();
                  }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask AI
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setCropRect(null);
                  }}
                  className="flex items-center justify-center rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
        </div>
      )}

      {/* Layer 5.8: Floating action bar for Read mode text selection
           Rendered via Portal to escape CSS transform container so position: fixed works correctly */}
      {activeTool === 'read' &&
        textSelectionRect &&
        createPortal(
          <div
            className="fixed z-[100] flex items-center gap-1 rounded-full border bg-white px-2 py-1 shadow-lg"
            style={{
              left: textSelectionRect.left + textSelectionRect.width / 2,
              top: textSelectionRect.top - 40,
              transform: 'translateX(-50%)',
              pointerEvents: 'auto',
            }}
          >
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = selectedTextRef.current;
                if (text && onAskAiWithText) {
                  onAskAiWithText(text);
                }
              }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask AI
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectedTextRef.current = '';
                selectedRectRef.current = null;
                setTextSelectionRect(null);
              }}
              className="flex items-center justify-center rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>,
          document.body,
        )}

      {/* Layer 6: Interaction layer — ALWAYS present
          In draw/erase mode: captures all events (pointer-events: auto, touch-action: none)
          In select mode: captures pointer events but allows finger scroll (touch-action: pan-y)
          In text mode: transparent (pointer-events: none), lets clicks reach editor */}
      <div
        ref={interactionLayerRef}
        className="absolute inset-0"
        style={{
          touchAction: isInteractionMode
            ? activeTool === 'select'
              ? 'pan-y'
              : 'none'
            : 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents:
            activeTool === 'read' || activeTool === 'crop'
              ? 'none'
              : isInteractionMode
                ? 'auto'
                : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
