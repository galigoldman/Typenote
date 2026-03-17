'use client';

import { useCallback, useRef, useState } from 'react';

import { CanvasEditor } from '@/components/canvas/canvas-editor';
import type { Document } from '@/types/database';
import type { PendingAiContext } from './ai-chat-panel';

import { AiChatWrapper } from './ai-chat-wrapper';

interface DocumentWithAiProps {
  courseId: string;
  courseName: string;
  weekId?: string;
  weekLabel?: string;
  document: Document;
  materialId?: string | null;
}

export function DocumentWithAi({
  courseId,
  courseName,
  weekId,
  weekLabel,
  document,
  materialId,
}: DocumentWithAiProps) {
  const getDocumentTextRef = useRef<(() => string) | null>(null);
  const [pendingContext, setPendingContext] = useState<PendingAiContext>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);

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
      setPendingContext(context);
      setIsAiOpen(true);
    },
    [],
  );

  const handleContextCleared = useCallback(() => {
    setPendingContext(null);
  }, []);

  return (
    <>
      <div className="flex justify-end px-4">
        <AiChatWrapper
          courseId={courseId}
          courseName={courseName}
          weekId={weekId}
          weekLabel={weekLabel}
          getDocumentContent={getDocumentContent}
          pendingContext={pendingContext}
          onContextCleared={handleContextCleared}
          isOpen={isAiOpen}
          onToggle={() => setIsAiOpen((prev) => !prev)}
          onClose={() => setIsAiOpen(false)}
        />
      </div>
      <CanvasEditor
        document={document}
        onDocumentTextReady={handleDocumentTextReady}
        materialId={materialId}
        onAskAiWithContext={handleAskAiWithContext}
      />
    </>
  );
}
