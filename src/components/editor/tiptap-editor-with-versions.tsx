'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Document } from '@/types/database';
import { TiptapEditor } from './tiptap-editor';
import { VersionSidebar } from '@/components/version-history/version-sidebar';
import { AiChatWrapper } from '@/components/ai/ai-chat-wrapper';
import {
  FocusFilesPanel,
  type ViewerTarget,
} from '@/components/dashboard/focus-files-panel';
import { FileViewer } from '@/components/dashboard/file-viewer';
import { getContextFiles } from '@/lib/actions/context-files';

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

  const [isFocusFilesOpen, setIsFocusFilesOpen] = useState(false);
  const [focusFilesCount, setFocusFilesCount] = useState(0);

  // Load the count once so the toolbar badge is correct before first open.
  useEffect(() => {
    if (!courseId) return;
    let active = true;
    getContextFiles(document.id)
      .then((list) => {
        if (active) setFocusFilesCount(list.length);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [courseId, document.id]);

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
          onToggleFocusFiles={
            courseId ? () => setIsFocusFilesOpen((prev) => !prev) : undefined
          }
          focusFilesCount={focusFilesCount}
          isFocusFilesOpen={isFocusFilesOpen}
        />
      </div>
      <VersionSidebar
        documentId={document.id}
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
      />
      {courseId && (
        <FocusFilesPanel
          documentId={document.id}
          courseId={courseId}
          isOpen={isFocusFilesOpen}
          onClose={() => setIsFocusFilesOpen(false)}
          onCountChange={setFocusFilesCount}
          onOpenFile={openViewer}
        />
      )}
      <AiChatWrapper
        courseId={courseId}
        courseName={courseName}
        documentId={document.id}
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
