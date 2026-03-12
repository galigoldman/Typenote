'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type {
  CanvasDocument,
  CanvasPage as CanvasPageData,
  CanvasTool,
  Stroke,
  StrokePoint,
} from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import type { Document } from '@/types/database';
import type { SaveStatus } from '@/hooks/use-auto-save';
import type { ConnectionStatus } from '@/hooks/use-realtime-sync';
import { Pen, Type, Eraser, Highlighter, Undo2, Redo2, Trash2, Plus } from 'lucide-react';
import { CANVAS_TYPES } from '@/lib/constants/subjects';
import { PageTypeThumb } from '@/components/ui/page-type-thumb';
import { useDocumentSync } from '@/hooks/use-document-sync';
import { useDrawing } from '@/hooks/use-drawing';
import { useEraser } from '@/hooks/use-eraser';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { CanvasPage } from './canvas-page';

interface CanvasEditorProps {
  document: Document;
}

const CANVAS_CLASSES: Record<string, string> = {
  blank: '',
  lined: 'canvas-lined',
  grid: 'canvas-grid',
  dotted: 'canvas-dotted',
};

/** Returns true if a page has any real content (strokes or typed text). */
function pageHasContent(page: CanvasPageData): boolean {
  if (page.strokes.length > 0) return true;
  if (!page.flowContent) return false;
  // An empty TipTap editor produces { type:'doc', content:[{type:'paragraph'}] }.
  // Real text contains a "text" key somewhere in the JSON.
  return JSON.stringify(page.flowContent).includes('"text"');
}

const PEN_COLORS = [
  '#000000', '#374151', '#DC2626', '#EA580C', '#CA8A04',
  '#16A34A', '#2563EB', '#7C3AED', '#DB2777', '#FFFFFF',
];

const HIGHLIGHTER_COLORS = [
  '#FBBF24', '#34D399', '#60A5FA', '#F472B6', '#A78BFA',
];

const PEN_SIZES = [
  { label: 'S', value: 1.5 },
  { label: 'M', value: 3 },
  { label: 'L', value: 5 },
  { label: 'XL', value: 8 },
];

const HIGHLIGHTER_SIZES = [
  { label: 'S', value: 8 },
  { label: 'M', value: 20 },
  { label: 'L', value: 32 },
];

const ERASER_SIZES = [
  { label: 'S', value: 6 },
  { label: 'M', value: 14 },
  { label: 'L', value: 24 },
];

function SaveIndicator({ status }: { status: SaveStatus }) {
  const labels: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved',
  };
  const colors: Record<SaveStatus, string> = {
    saved: 'text-green-600',
    saving: 'text-yellow-600',
    unsaved: 'text-red-600',
  };
  return <span className={`text-sm ${colors[status]}`}>{labels[status]}</span>;
}

function ConnectionIndicator({
  status,
  isLockedByRemote,
}: {
  status: ConnectionStatus;
  isLockedByRemote: boolean;
}) {
  if (isLockedByRemote) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
        Editing elsewhere
      </span>
    );
  }
  const config: Record<ConnectionStatus, { color: string; label: string }> = {
    connected: { color: 'bg-green-500', label: 'Synced' },
    connecting: { color: 'bg-yellow-500', label: 'Connecting' },
    disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  };
  const { color, label } = config[status];
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function createEmptyPage(order: number, pageType?: string): CanvasPageData {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    order,
    pageType: pageType as CanvasPageData['pageType'],
    strokes: [],
    textBoxes: [],
    flowContent: null,
  };
}

function initializePagesFromDocument(doc: Document): CanvasPageData[] {
  const pagesData = doc.pages as CanvasDocument | null;
  if (pagesData?.pages && pagesData.pages.length > 0) {
    const loaded = pagesData.pages;
    // Always ensure a trailing empty page for infinite-scroll feel
    const lastPage = loaded[loaded.length - 1];
    if (pageHasContent(lastPage)) {
      const newType = lastPage.pageType || doc.canvas_type;
      return [...loaded, createEmptyPage(loaded.length, newType)];
    }
    return loaded;
  }
  return [createEmptyPage(0, doc.canvas_type)];
}

export function CanvasEditor({ document }: CanvasEditorProps) {
  const [title, setTitle] = useState(document.title);
  const [pages, setPages] = useState<CanvasPageData[]>(() =>
    initializePagesFromDocument(document),
  );
  const [activeTool, setActiveTool] = useState<CanvasTool>('text');
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [remoteUpdateCounter, setRemoteUpdateCounter] = useState(0);

  // Add page popover
  const [addPagePopoverIndex, setAddPagePopoverIndex] = useState<number | null>(null);

  // Drawing tool settings
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(3);
  const [highlighterColor, setHighlighterColor] = useState('#FBBF24');
  const [highlighterSize, setHighlighterSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(14);

  // Derived values based on active tool
  const currentColor = activeTool === 'highlighter' ? highlighterColor : penColor;
  const currentSize = activeTool === 'highlighter' ? highlighterSize : penSize;
  const currentOpacity = activeTool === 'highlighter' ? 0.4 : 1;

  // Stroke undo/redo history
  type StrokeAction = { type: 'add' | 'remove'; pageId: string; stroke: Stroke };
  const undoStackRef = useRef<StrokeAction[]>([]);
  const redoStackRef = useRef<StrokeAction[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const getPagesData = useCallback((): Record<string, unknown> => {
    // Strip empty trailing pages — only save pages with content
    const all = pagesRef.current;
    let lastContentIndex = all.length - 1;
    while (lastContentIndex > 0 && !pageHasContent(all[lastContentIndex])) {
      lastContentIndex--;
    }
    const toSave = all.slice(0, lastContentIndex + 1);
    return { pages: toSave } as unknown as Record<string, unknown>;
  }, []);

  const onRemoteTitleUpdate = useCallback((remoteTitle: string) => {
    setTitle(remoteTitle);
  }, []);

  const onRemotePagesUpdate = useCallback(
    (remotePagesData: Record<string, unknown>) => {
      const remote = remotePagesData as unknown as CanvasDocument;
      if (remote?.pages) {
        setPages(remote.pages);
        setRemoteUpdateCounter((c) => c + 1);
      }
    },
    [],
  );

  const {
    saveStatus,
    connectionStatus,
    isLockedByRemote,
    unlockEditor,
    triggerSave,
    saveTitle,
  } = useDocumentSync({
    documentId: document.id,
    editor: null,
    onRemoteTitleUpdate,
    getPagesData,
    onRemotePagesUpdate,
  });

  // Stroke management (with undo history + auto-add page)
  const handleStrokeAdd = useCallback(
    (pageId: string, stroke: Stroke) => {
      undoStackRef.current.push({ type: 'add', pageId, stroke });
      redoStackRef.current = [];
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      setHistoryVersion((v) => v + 1);
      setPages((prev) => {
        const updated = prev.map((p) =>
          p.id === pageId ? { ...p, strokes: [...p.strokes, stroke] } : p,
        );
        // Auto-add page when the last page now has content
        const lastPage = updated[updated.length - 1];
        if (pageHasContent(lastPage)) {
          const newType = lastPage.pageType || document.canvas_type;
          return [...updated, createEmptyPage(updated.length, newType)];
        }
        return updated;
      });
      triggerSave();
    },
    [triggerSave, document.canvas_type],
  );

  const handleStrokeRemove = useCallback(
    (pageId: string, strokeId: string) => {
      const stroke = pagesRef.current.find((p) => p.id === pageId)?.strokes.find((s) => s.id === strokeId);
      if (stroke) {
        undoStackRef.current.push({ type: 'remove', pageId, stroke });
        redoStackRef.current = [];
        if (undoStackRef.current.length > 100) undoStackRef.current.shift();
        setHistoryVersion((v) => v + 1);
      }
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? { ...p, strokes: p.strokes.filter((s) => s.id !== strokeId) }
            : p,
        ),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Flow content update handler (save only — auto-add is triggered by
  // overflow detection in CanvasPage, like Word/Google Docs)
  const handleFlowContentUpdate = useCallback(
    (pageId: string, content: Record<string, unknown>) => {
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId ? { ...p, flowContent: content } : p,
        ),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Pending focus: when a new page is created from text overflow, we want to
  // auto-focus its editor once it mounts.
  const pendingFocusPageIdRef = useRef<string | null>(null);

  // Editor ready / focus handler — receives pageId from CanvasPage
  const handleEditorReady = useCallback((pageId: string, editor: Editor) => {
    setActiveEditor(editor);
    // If this page was just created by text overflow, focus it at the start
    if (pendingFocusPageIdRef.current === pageId) {
      pendingFocusPageIdRef.current = null;
      // Small delay to ensure the editor DOM is fully settled
      setTimeout(() => {
        editor.commands.focus('end');
      }, 50);
    }
  }, []);

  // Get strokes for a page (used by eraser)
  const getPageStrokes = useCallback(
    (pageId: string): Stroke[] => {
      return pagesRef.current.find((p) => p.id === pageId)?.strokes ?? [];
    },
    [],
  );

  // Auto-add page when drawing near the bottom of the last page
  const handleNearPageBottom = useCallback(
    (pageId: string) => {
      setPages((prev) => {
        const lastPage = prev[prev.length - 1];
        if (lastPage.id === pageId) {
          const newType = lastPage.pageType || document.canvas_type;
          return [...prev, createEmptyPage(prev.length, newType)];
        }
        return prev;
      });
    },
    [document.canvas_type],
  );

  // Text overflow handler — creates a new page with the overflowed content,
  // scrolls to it, and queues auto-focus for its editor (like Google Docs).
  const handleTextOverflow = useCallback(
    (pageId: string, overflowContent: Record<string, unknown> | null) => {
      setPages((prev) => {
        const pageIndex = prev.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return prev;
        // Only auto-add after the last page
        if (pageIndex !== prev.length - 1) return prev;

        const currentPage = prev[pageIndex];
        const newType = currentPage.pageType || document.canvas_type;
        const newPage = createEmptyPage(prev.length, newType);
        if (overflowContent) {
          newPage.flowContent = overflowContent;
        }

        // Queue focus for the new page's editor
        pendingFocusPageIdRef.current = newPage.id;

        // Scroll to the new page after React renders it
        setTimeout(() => {
          const scrollContainer = globalThis.document.querySelector(
            '[data-scroll-container]',
          ) as HTMLElement | null;
          if (scrollContainer) {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: 'smooth',
            });
          }
        }, 100);

        return [...prev, newPage];
      });
      triggerSave();
    },
    [triggerSave, document.canvas_type],
  );

  // Drawing hook
  const { handlePointerDown: drawDown, handlePointerMove: drawMove, handlePointerUp: drawUp } = useDrawing({
    activeTool,
    penColor: currentColor,
    penSize: currentSize,
    penOpacity: currentOpacity,
    onStrokeComplete: handleStrokeAdd,
    onNearPageBottom: handleNearPageBottom,
  });

  // Eraser hook
  const { handlePointerDown: eraseDown, handlePointerMove: eraseMove, handlePointerUp: eraseUp, eraserPosition } = useEraser({
    activeTool,
    eraserRadius: eraserSize,
    onStrokeRemove: handleStrokeRemove,
    getPageStrokes,
  });

  // Route pointer events to active tool's handler
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      drawDown(e, pageId);
      eraseDown(e, pageId);
    },
    [drawDown, eraseDown],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      drawMove(e, pageId);
      eraseMove(e, pageId);
    },
    [drawMove, eraseMove],
  );
  const handlePointerUp = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      drawUp(e, pageId);
      eraseUp(e, pageId);
    },
    [drawUp, eraseUp],
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (activeTool === 'text' && activeEditor) {
      activeEditor.chain().focus().undo().run();
      return;
    }
    const action = undoStackRef.current.pop();
    if (!action) return;
    if (action.type === 'add') {
      setPages((prev) =>
        prev.map((p) =>
          p.id === action.pageId
            ? { ...p, strokes: p.strokes.filter((s) => s.id !== action.stroke.id) }
            : p,
        ),
      );
    } else {
      setPages((prev) =>
        prev.map((p) =>
          p.id === action.pageId
            ? { ...p, strokes: [...p.strokes, action.stroke] }
            : p,
        ),
      );
    }
    redoStackRef.current.push(action);
    setHistoryVersion((v) => v + 1);
    triggerSave();
  }, [activeTool, activeEditor, triggerSave]);

  const handleRedo = useCallback(() => {
    if (activeTool === 'text' && activeEditor) {
      activeEditor.chain().focus().redo().run();
      return;
    }
    const action = redoStackRef.current.pop();
    if (!action) return;
    if (action.type === 'add') {
      setPages((prev) =>
        prev.map((p) =>
          p.id === action.pageId
            ? { ...p, strokes: [...p.strokes, action.stroke] }
            : p,
        ),
      );
    } else {
      setPages((prev) =>
        prev.map((p) =>
          p.id === action.pageId
            ? { ...p, strokes: p.strokes.filter((s) => s.id !== action.stroke.id) }
            : p,
        ),
      );
    }
    undoStackRef.current.push(action);
    setHistoryVersion((v) => v + 1);
    triggerSave();
  }, [activeTool, activeEditor, triggerSave]);

  // Compute disabled state (draw mode only — text mode always enabled)
  const canUndoDraw = historyVersion >= 0 && undoStackRef.current.length > 0;
  const canRedoDraw = historyVersion >= 0 && redoStackRef.current.length > 0;

  // Page management
  const handleDeletePage = useCallback(
    (pageId: string) => {
      setPages((prev) => {
        if (prev.length <= 1) return prev;
        return prev.filter((p) => p.id !== pageId).map((p, i) => ({ ...p, order: i }));
      });
      triggerSave();
    },
    [triggerSave],
  );

  const handleAddPage = useCallback(
    (afterIndex: number, pageType: string) => {
      setPages((prev) => {
        const newPage = createEmptyPage(afterIndex + 1, pageType);
        const updated = [
          ...prev.slice(0, afterIndex + 1),
          newPage,
          ...prev.slice(afterIndex + 1),
        ].map((p, i) => ({ ...p, order: i }));
        return updated;
      });
      setAddPagePopoverIndex(null);
      triggerSave();
    },
    [triggerSave],
  );

  // Close add page popover on outside click
  useEffect(() => {
    if (addPagePopoverIndex === null) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-add-page-popover]')) {
        setAddPagePopoverIndex(null);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [addPagePopoverIndex]);

  const handleTitleBlur = async () => {
    if (title !== document.title) {
      await saveTitle(title);
    }
  };

  const handleTakeOver = () => {
    unlockEditor();
  };

  const isDrawMode = activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'eraser';
  const showColorSize = activeTool === 'pen' || activeTool === 'highlighter';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="text-xl font-semibold bg-transparent border-none outline-none flex-1"
          placeholder="Untitled"
        />
        <div className="flex items-center gap-3">
          <ConnectionIndicator
            status={connectionStatus}
            isLockedByRemote={isLockedByRemote}
          />
          <SaveIndicator status={saveStatus} />
        </div>
      </div>

      {/* Remote editing lock banner */}
      {isLockedByRemote && (
        <div className="flex items-center justify-between bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          <span>This document is being edited on another device.</span>
          <button
            onClick={handleTakeOver}
            className="font-medium underline hover:text-yellow-900"
          >
            Take over editing
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center border-b px-2 py-1">
        {/* Undo / Redo — always visible */}
        <div className="flex items-center gap-0.5 mr-2">
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleUndo(); }}
            disabled={isDrawMode ? !canUndoDraw : false}
            className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none text-muted-foreground"
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleRedo(); }}
            disabled={isDrawMode ? !canRedoDraw : false}
            className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none text-muted-foreground"
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        <div className="h-6 w-px bg-border mr-2" />

        {/* Mode toggle: Draw / Type */}
        <div className="flex items-center gap-1">
          <button
            onPointerDown={(e) => { e.stopPropagation(); if (!isDrawMode) setActiveTool('pen'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isDrawMode
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <Pen className="h-4 w-4" />
            Draw
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); setActiveTool('text'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTool === 'text'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <Type className="h-4 w-4" />
            Type
          </button>
        </div>

        {/* Draw mode: sub-tool icons */}
        {isDrawMode && (
          <>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="flex items-center gap-1">
              <button
                onPointerDown={(e) => { e.stopPropagation(); setActiveTool('pen'); }}
                className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                  activeTool === 'pen'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
                title="Pen"
              >
                <Pen className="h-4 w-4" />
              </button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); setActiveTool('highlighter'); }}
                className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                  activeTool === 'highlighter'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
                title="Highlighter"
              >
                <Highlighter className="h-4 w-4" />
              </button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); setActiveTool('eraser'); }}
                className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                  activeTool === 'eraser'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
                title="Eraser"
              >
                <Eraser className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {/* Type mode: text formatting toolbar */}
        {activeTool === 'text' && activeEditor && (
          <>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="flex-1">
              <EditorToolbar editor={activeEditor} hideUndoRedo />
            </div>
          </>
        )}
      </div>

      {/* Main content: canvas + optional right sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas scroll area */}
        <div
          className="flex-1 overflow-y-auto bg-gray-100"
          data-scroll-container
          style={{
            userSelect: activeTool === 'text' ? 'auto' : 'none',
            WebkitUserSelect: activeTool === 'text' ? 'auto' : 'none',
          }}
        >
          <div className="py-8">
            {pages.map((page, index) => {
              const effectiveType = page.pageType || document.canvas_type;
              return (
                <div key={page.id}>
                  <CanvasPage
                    page={page}
                    activeTool={activeTool}
                    canvasType={effectiveType}
                    onStrokeAdd={handleStrokeAdd}
                    onStrokeRemove={handleStrokeRemove}
                    onPointerDown={(e) => handlePointerDown(e, page.id)}
                    onPointerMove={(e) => handlePointerMove(e, page.id)}
                    onPointerUp={(e) => handlePointerUp(e, page.id)}
                    onFlowContentUpdate={handleFlowContentUpdate}
                    onEditorReady={handleEditorReady}
                    onTextOverflow={handleTextOverflow}
                    canvasClass={CANVAS_CLASSES[effectiveType] ?? ''}
                    eraserPosition={activeTool === 'eraser' ? eraserPosition : null}
                    eraserRadius={eraserSize}
                    remoteUpdateCounter={remoteUpdateCounter}
                  />
                  {/* Page break divider */}
                  <div
                    className="group flex items-center justify-center mx-auto py-1.5"
                    style={{ width: PAGE_WIDTH }}
                  >
                    <div className="h-px flex-1 bg-border" />
                    <span className="px-3 text-xs text-muted-foreground select-none">
                      {index + 1} / {pages.length}
                    </span>
                    {/* Add page button */}
                    <div className="relative" data-add-page-popover>
                      <button
                        onClick={() => setAddPagePopoverIndex(addPagePopoverIndex === index ? null : index)}
                        className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
                        title="Add page"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      {addPagePopoverIndex === index && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border rounded-lg shadow-lg z-50 p-2">
                          <div className="flex gap-2">
                            {CANVAS_TYPES.map((t) => (
                              <button
                                key={t.value}
                                onClick={() => handleAddPage(index, t.value)}
                                className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-accent transition-colors"
                              >
                                <PageTypeThumb type={t.value} size={36} />
                                <span className="text-[10px] text-muted-foreground">{t.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {pages.length > 1 && (
                      <button
                        onClick={() => handleDeletePage(page.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Delete page"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
              );
            })}

          </div>
        </div>

        {/* Right sidebar — draw mode settings */}
        {isDrawMode && (
          <div className="flex flex-col items-center gap-1 border-l bg-background py-3 overflow-y-auto" style={{ width: 48 }}>
            {/* Pen: thickness + colors */}
            {activeTool === 'pen' && (
              <>
                {/* Thickness dots */}
                {PEN_SIZES.map((s) => (
                  <button
                    key={s.label}
                    onPointerDown={(e) => { e.stopPropagation(); setPenSize(s.value); }}
                    className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                      penSize === s.value ? 'bg-accent ring-1 ring-primary/50' : 'hover:bg-accent/50'
                    }`}
                    title={`${s.label} (${s.value}px)`}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: Math.max(Math.min(s.value * 2, 18), 4),
                        height: Math.max(Math.min(s.value * 2, 18), 4),
                        backgroundColor: penColor,
                      }}
                    />
                  </button>
                ))}

                <div className="w-6 h-px bg-border my-1" />

                {/* Color swatches */}
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    onPointerDown={(e) => { e.stopPropagation(); setPenColor(c); }}
                    className={`flex items-center justify-center rounded-full transition-transform hover:scale-110 ${
                      penColor === c ? 'ring-2 ring-primary ring-offset-1 scale-110' : ''
                    }`}
                    style={{ width: 28, height: 28 }}
                    title={c}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: c,
                        border: c === '#FFFFFF' ? '1px solid #d1d5db' : undefined,
                      }}
                    />
                  </button>
                ))}
              </>
            )}

            {/* Highlighter: colors only */}
            {activeTool === 'highlighter' && (
              <>
                {HIGHLIGHTER_COLORS.map((c) => (
                  <button
                    key={c}
                    onPointerDown={(e) => { e.stopPropagation(); setHighlighterColor(c); }}
                    className={`flex items-center justify-center rounded-full transition-transform hover:scale-110 ${
                      highlighterColor === c ? 'ring-2 ring-primary ring-offset-1 scale-110' : ''
                    }`}
                    style={{ width: 28, height: 28 }}
                    title={c}
                  >
                    <span
                      className="rounded-full"
                      style={{ width: 22, height: 22, backgroundColor: c }}
                    />
                  </button>
                ))}
              </>
            )}

            {/* Eraser: 3 sizes */}
            {activeTool === 'eraser' && (
              <>
                {ERASER_SIZES.map((s) => (
                  <button
                    key={s.label}
                    onPointerDown={(e) => { e.stopPropagation(); setEraserSize(s.value); }}
                    className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                      eraserSize === s.value ? 'bg-accent ring-1 ring-primary/50' : 'hover:bg-accent/50'
                    }`}
                    title={`${s.label} eraser`}
                  >
                    <span
                      className="rounded-full border border-gray-300"
                      style={{
                        width: Math.max(s.value * 1.2, 8),
                        height: Math.max(s.value * 1.2, 8),
                        backgroundColor: '#ffffff',
                      }}
                    />
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Canvas background styles */}
      <style jsx global>{`
        .canvas-lined {
          background-image: repeating-linear-gradient(
            transparent,
            transparent 31px,
            #e5e7eb 31px,
            #e5e7eb 32px
          );
          background-size: 100% 32px;
        }
        .canvas-grid {
          background-image:
            linear-gradient(#e5e7eb 1px, transparent 1px),
            linear-gradient(90deg, #e5e7eb 1px, transparent 1px);
          background-size: 32px 32px;
        }
        .canvas-dotted {
          background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>
    </div>
  );
}
