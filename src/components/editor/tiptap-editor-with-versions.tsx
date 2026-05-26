'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Document } from '@/types/database';
import { TiptapEditor } from './tiptap-editor';
import { VersionSidebar } from '@/components/version-history/version-sidebar';
import { AiChatWrapper } from '@/components/ai/ai-chat-wrapper';
import { DocumentContextFiles, type ViewerTarget } from '@/components/dashboard/document-context-files';
import { FileViewer } from '@/components/dashboard/file-viewer';

interface TiptapEditorWithVersionsProps {
  document: Document;
  courseId?: string;
  courseName?: string;
}

export function TiptapEditorWithVersions({
  document,
  courseId,
  courseName,
}: TiptapEditorWithVersionsProps) {
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

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TiptapEditor
          document={document}
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
        onOpenSource={(fileType, fileId, page) => openViewer({ fileType, fileId, page })}
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
