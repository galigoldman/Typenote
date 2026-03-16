'use client';

import { useCallback, useRef } from 'react';

import { CanvasEditor } from '@/components/canvas/canvas-editor';
import type { Document } from '@/types/database';

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
  // Ref holds a getter function populated by CanvasEditor
  const getDocumentTextRef = useRef<(() => string) | null>(null);

  const handleDocumentTextReady = useCallback((getter: () => string) => {
    getDocumentTextRef.current = getter;
  }, []);

  const getDocumentContent = useCallback(() => {
    return getDocumentTextRef.current?.() ?? '';
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
        />
      </div>
      <CanvasEditor
        document={document}
        onDocumentTextReady={handleDocumentTextReady}
        materialId={materialId}
      />
    </>
  );
}
