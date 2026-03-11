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
import { Pen, Type, Eraser, Highlighter } from 'lucide-react';
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
};

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

function createEmptyPage(order: number): CanvasPageData {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    order,
    strokes: [],
    textBoxes: [],
    flowContent: null,
  };
}

function initializePagesFromDocument(doc: Document): CanvasPageData[] {
  const pagesData = doc.pages as CanvasDocument | null;
  if (pagesData?.pages && pagesData.pages.length > 0) {
    return pagesData.pages;
  }
  return [createEmptyPage(0)];
}

export function CanvasEditor({ document }: CanvasEditorProps) {
  const [title, setTitle] = useState(document.title);
  const [pages, setPages] = useState<CanvasPageData[]>(() =>
    initializePagesFromDocument(document),
  );
  const [activeTool, setActiveTool] = useState<CanvasTool>('text');
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [remoteUpdateCounter, setRemoteUpdateCounter] = useState(0);

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

  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const getPagesData = useCallback((): Record<string, unknown> => {
    return { pages: pagesRef.current } as unknown as Record<string, unknown>;
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

  // Stroke management
  const handleStrokeAdd = useCallback(
    (pageId: string, stroke: Stroke) => {
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId ? { ...p, strokes: [...p.strokes, stroke] } : p,
        ),
      );
      triggerSave();
    },
    [triggerSave],
  );

  const handleStrokeRemove = useCallback(
    (pageId: string, strokeId: string) => {
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

  // Flow content update handler
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

  // Editor focus handler
  const handleEditorFocus = useCallback((editor: Editor) => {
    setActiveEditor(editor);
  }, []);

  // Get strokes for a page (used by eraser)
  const getPageStrokes = useCallback(
    (pageId: string): Stroke[] => {
      return pagesRef.current.find((p) => p.id === pageId)?.strokes ?? [];
    },
    [],
  );

  // Drawing hook
  const { handlePointerDown: drawDown, handlePointerMove: drawMove, handlePointerUp: drawUp } = useDrawing({
    activeTool,
    penColor: currentColor,
    penSize: currentSize,
    penOpacity: currentOpacity,
    onStrokeComplete: handleStrokeAdd,
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

  const handleTitleBlur = async () => {
    if (title !== document.title) {
      await saveTitle(title);
    }
  };

  const handleTakeOver = () => {
    unlockEditor();
  };

  const canvasClass = CANVAS_CLASSES[document.canvas_type] ?? '';
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
              <EditorToolbar editor={activeEditor} />
            </div>
          </>
        )}
      </div>

      {/* Main content: canvas + optional right sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas scroll area */}
        <div
          className="flex-1 overflow-y-auto bg-gray-100"
          style={{
            userSelect: activeTool === 'text' ? 'auto' : 'none',
            WebkitUserSelect: activeTool === 'text' ? 'auto' : 'none',
          }}
        >
          <div className="py-8">
            {pages.map((page) => (
              <CanvasPage
                key={page.id}
                page={page}
                activeTool={activeTool}
                canvasType={document.canvas_type}
                onStrokeAdd={handleStrokeAdd}
                onStrokeRemove={handleStrokeRemove}
                onPointerDown={(e) => handlePointerDown(e, page.id)}
                onPointerMove={(e) => handlePointerMove(e, page.id)}
                onPointerUp={(e) => handlePointerUp(e, page.id)}
                onFlowContentUpdate={handleFlowContentUpdate}
                onEditorReady={handleEditorFocus}
                canvasClass={canvasClass}
                eraserPosition={activeTool === 'eraser' ? eraserPosition : null}
                eraserRadius={eraserSize}
                remoteUpdateCounter={remoteUpdateCounter}
              />
            ))}
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
      `}</style>
    </div>
  );
}
