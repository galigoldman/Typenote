'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CanvasEditor } from '@/components/canvas/canvas-editor';
import { VersionSidebar } from '@/components/version-history/version-sidebar';
import {
  DocumentContextFiles,
  type ViewerTarget,
} from '@/components/dashboard/document-context-files';
import { FileViewer } from '@/components/dashboard/file-viewer';
import type { Document } from '@/types/database';
import type { AiContextItem } from './ai-chat-panel';

import { AiChatWrapper } from './ai-chat-wrapper';

interface DocumentWithAiProps {
  courseId?: string;
  courseName?: string;
  document: Document;
  materialId?: string | null;
  personalFileId?: string | null;
}

export function DocumentWithAi({
  courseId,
  courseName,
  document,
  materialId,
  personalFileId,
}: DocumentWithAiProps) {
  const getDocumentTextRef = useRef<(() => string) | null>(null);
  const [contextItems, setContextItems] = useState<AiContextItem[]>([]);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);
  const openViewer = useCallback((t: ViewerTarget) => setViewerTarget(t), []);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      new URLSearchParams(window.location.search).get('versionHistory') ===
      'open'
    );
  });

  // Clean up the URL parameter after reading it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('versionHistory') === 'open') {
      params.delete('versionHistory');
      const clean = params.toString()
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  const handleDocumentTextReady = useCallback((getter: () => string) => {
    getDocumentTextRef.current = getter;
  }, []);

  const getDocumentContent = useCallback(() => {
    return getDocumentTextRef.current?.() ?? '';
  }, []);

  const handleAskAiWithContext = useCallback(
    (
      context:
        | { type: 'text'; content: string }
        | { type: 'image'; dataUrl: string },
    ) => {
      setContextItems((prev) => [...prev, context]);
      setIsAiOpen(true);
    },
    [],
  );

  const handleRemoveContextItem = useCallback((index: number) => {
    setContextItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearAllContext = useCallback(() => {
    setContextItems([]);
  }, []);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CanvasEditor
          document={document}
          onDocumentTextReady={handleDocumentTextReady}
          materialId={materialId}
          personalFileId={personalFileId}
          courseName={courseName}
          isAiPanelOpen={isAiOpen}
          onAskAiWithContext={handleAskAiWithContext}
          onToggleVersionHistory={() =>
            setIsVersionHistoryOpen((prev) => !prev)
          }
        />
      </div>
      <VersionSidebar
        documentId={document.id}
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
      />
      {courseId && (
        <DocumentContextFiles
          documentId={document.id}
          courseId={courseId}
          onOpenFile={openViewer}
        />
      )}
      <AiChatWrapper
        courseId={courseId}
        courseName={courseName}
        documentId={document.id}
        getDocumentContent={getDocumentContent}
        pendingContextItems={contextItems}
        onRemoveContextItem={handleRemoveContextItem}
        onClearAllContext={handleClearAllContext}
        isOpen={isAiOpen}
        onToggle={() => setIsAiOpen((prev) => !prev)}
        onClose={() => setIsAiOpen(false)}
        onOpenSource={(fileType, fileId, page) =>
          openViewer({ fileType, fileId, page })
        }
      />
      {viewerTarget && (
        <FileViewer
          key={`${viewerTarget.fileType}:${viewerTarget.fileId}`}
          fileType={viewerTarget.fileType}
          fileId={viewerTarget.fileId}
          initialPage={viewerTarget.page}
          onClose={() => setViewerTarget(null)}
        />
      )}
    </div>
  );
}
