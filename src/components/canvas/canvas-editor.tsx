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
import { Pen, Type, Eraser, Highlighter, Minus } from 'lucide-react';
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

function ColorPicker({
  colors,
  activeColor,
  onSelect,
}: {
  colors: string[];
  activeColor: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Active color swatch */}
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-accent transition-colors"
        title="Pick color"
      >
        <div
          style={{
            width: 28,
            height: 28,
            minWidth: 28,
            minHeight: 28,
            borderRadius: '50%',
            backgroundColor: activeColor,
            border: '2px solid #d1d5db',
            display: 'block',
          }}
        />
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M3 5L6 8L9 5" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown palette */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 p-2.5 bg-popover border rounded-lg shadow-lg z-50"
          style={{ width: colors.length <= 5 ? 'auto' : 200 }}
        >
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <button
                key={color}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(color);
                  setOpen(false);
                }}
                className={`h-8 w-8 rounded-full border-2 shrink-0 transition-transform hover:scale-110 ${
                  activeColor === color ? 'scale-110 border-primary ring-2 ring-primary/30' : 'border-gray-200'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SizePicker({
  sizes,
  activeSize,
  onSelect,
  color,
}: {
  sizes: { label: string; value: number }[];
  activeSize: number;
  onSelect: (size: number) => void;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {sizes.map((s) => (
        <button
          key={s.label}
          onClick={() => onSelect(s.value)}
          className={`flex items-center justify-center h-7 w-7 rounded-md text-xs font-medium transition-colors ${
            activeSize === s.value
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          }`}
          title={`${s.label} (${s.value}px)`}
        >
          <Minus style={{ color: activeSize === s.value ? undefined : color }} strokeWidth={s.value} className="h-4 w-4" />
        </button>
      ))}
    </div>
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
  const [highlighterSize, setHighlighterSize] = useState(14);

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
      <div className="flex items-center border-b">
        {/* Mode selector: Draw / Type */}
        <div className="flex items-center gap-1 px-2 py-1 border-r">
          <button
            onClick={() => setActiveTool('pen')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isDrawMode
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <Pen className="h-4 w-4" />
            Draw
          </button>
          <button
            onClick={() => setActiveTool('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTool === 'text'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <Type className="h-4 w-4" />
            Type
          </button>
        </div>

        {/* Draw mode: sub-tools + color/size pickers */}
        {isDrawMode && (
          <>
            <div className="flex items-center gap-1 px-2 py-1 border-r">
              <button
                onClick={() => setActiveTool('pen')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                  activeTool === 'pen'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
              >
                <Pen className="h-3.5 w-3.5" />
                Pen
              </button>
              <button
                onClick={() => setActiveTool('highlighter')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                  activeTool === 'highlighter'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
              >
                <Highlighter className="h-3.5 w-3.5" />
                Highlight
              </button>
              <button
                onClick={() => setActiveTool('eraser')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                  activeTool === 'eraser'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
              >
                <Eraser className="h-3.5 w-3.5" />
                Eraser
              </button>
            </div>

            {showColorSize && (
              <div className="flex items-center gap-3 px-3 py-1">
                <ColorPicker
                  colors={activeTool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS}
                  activeColor={activeTool === 'highlighter' ? highlighterColor : penColor}
                  onSelect={activeTool === 'highlighter' ? setHighlighterColor : setPenColor}
                />
                <div className="h-5 w-px bg-border" />
                <SizePicker
                  sizes={activeTool === 'highlighter' ? HIGHLIGHTER_SIZES : PEN_SIZES}
                  activeSize={activeTool === 'highlighter' ? highlighterSize : penSize}
                  onSelect={activeTool === 'highlighter' ? setHighlighterSize : setPenSize}
                  color={activeTool === 'highlighter' ? highlighterColor : penColor}
                />
              </div>
            )}
          </>
        )}

        {/* Type mode: text formatting toolbar */}
        {activeTool === 'text' && activeEditor && (
          <div className="flex-1">
            <EditorToolbar editor={activeEditor} />
          </div>
        )}
      </div>

      {/* Canvas area */}
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
              remoteUpdateCounter={remoteUpdateCounter}
            />
          ))}
        </div>
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
