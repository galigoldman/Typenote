'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useDocumentSync } from '@/hooks/use-document-sync';
import { useDrawing } from '@/hooks/use-drawing';
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
    flowContent: { type: 'doc', content: [] },
  };
}

function initializePagesFromDocument(doc: Document): CanvasPageData[] {
  const pagesData = doc.pages as CanvasDocument | null;
  if (pagesData?.pages && pagesData.pages.length > 0) {
    return pagesData.pages;
  }
  // Initialize a single empty page
  return [createEmptyPage(0)];
}

export function CanvasEditor({ document }: CanvasEditorProps) {
  const [title, setTitle] = useState(document.title);
  const [pages, setPages] = useState<CanvasPageData[]>(() =>
    initializePagesFromDocument(document),
  );
  const [activeTool] = useState<CanvasTool>('pen');
  const pagesRef = useRef(pages);
  const skipNextUpdateRef = useRef(false);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // Dummy editor for useDocumentSync compatibility (will be replaced in US2)
  const dummyEditorRef = useRef<null>(null);

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
    editor: dummyEditorRef.current,
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

  // Drawing hook
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useDrawing({
    activeTool,
    onStrokeComplete: handleStrokeAdd,
  });

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

      {/* Canvas area */}
      <div
        className="flex-1 overflow-y-auto bg-gray-100"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <div className="py-8">
          {pages.map((page) => (
            <CanvasPage
              key={page.id}
              page={page}
              activeTool={activeTool}
              onStrokeAdd={handleStrokeAdd}
              onStrokeRemove={handleStrokeRemove}
              onPointerDown={(e) => handlePointerDown(e, page.id)}
              onPointerMove={(e) => handlePointerMove(e, page.id)}
              onPointerUp={(e) => handlePointerUp(e, page.id)}
              canvasClass={canvasClass}
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
