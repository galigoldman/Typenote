'use client';

import { useEffect, useState } from 'react';
import type { Document } from '@/types/database';
import { TiptapEditor } from './tiptap-editor';
import { VersionSidebar } from '@/components/version-history/version-sidebar';
import { AiChatWrapper } from '@/components/ai/ai-chat-wrapper';

interface TiptapEditorWithVersionsProps {
  document: Document;
  courseId?: string;
  courseName?: string;
  weekId?: string;
  weekLabel?: string;
}

export function TiptapEditorWithVersions({
  document,
  courseId,
  courseName,
  weekId,
  weekLabel,
}: TiptapEditorWithVersionsProps) {
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  // Re-open sidebar after a version restore (reload with ?versionHistory=open)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('versionHistory') === 'open') {
      setIsVersionHistoryOpen(true);
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
      <AiChatWrapper
        courseId={courseId}
        courseName={courseName}
        weekId={weekId}
        weekLabel={weekLabel}
      />
    </div>
  );
}
