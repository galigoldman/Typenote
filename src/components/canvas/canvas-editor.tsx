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
import { Pen, Type, Eraser } from 'lucide-react';
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

      {/* Mode toggle + toolbar */}
      <div className="flex items-center border-b">
        <div className="flex items-center gap-1 px-2 py-1 border-r">
          <button
            onClick={() => setActiveTool('pen')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTool === 'pen'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <Pen className="h-4 w-4" />
            Draw
          </button>
          <button
            onClick={() => setActiveTool('eraser')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTool === 'eraser'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <Eraser className="h-4 w-4" />
            Erase
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
