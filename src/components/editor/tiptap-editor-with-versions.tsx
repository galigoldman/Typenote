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
}

export function TiptapEditorWithVersions({
  document,
  courseId,
  courseName,
}: TiptapEditorWithVersionsProps) {
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
      <AiChatWrapper courseId={courseId} courseName={courseName} />
    </div>
  );
}
