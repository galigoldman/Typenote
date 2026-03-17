'use client';

import { useCallback, useRef, useState } from 'react';

import { CanvasEditor } from '@/components/canvas/canvas-editor';
import type { Document } from '@/types/database';
import type { AiContextItem } from './ai-chat-panel';
import type { CanvasTool } from '@/types/canvas';

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
  const toolSwitcherRef = useRef<((tool: CanvasTool) => void) | null>(null);
  const [contextItems, setContextItems] = useState<AiContextItem[]>([]);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const handleDocumentTextReady = useCallback((getter: () => string) => {
    getDocumentTextRef.current = getter;
  }, []);

  const getDocumentContent = useCallback(() => {
    return getDocumentTextRef.current?.() ?? '';
  }, []);

  const handleToolSwitchReady = useCallback(
    (switcher: (tool: CanvasTool) => void) => {
      toolSwitcherRef.current = switcher;
    },
    [],
  );

  // Append a new context item — accumulates, doesn't replace
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

  const handleRequestMarkText = useCallback(() => {
    toolSwitcherRef.current?.('read');
  }, []);

  const handleRequestScreenshot = useCallback(() => {
    toolSwitcherRef.current?.('select');
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
          pendingContextItems={contextItems}
          onRemoveContextItem={handleRemoveContextItem}
          onClearAllContext={handleClearAllContext}
          isOpen={isAiOpen}
          onToggle={() => setIsAiOpen((prev) => !prev)}
          onClose={() => setIsAiOpen(false)}
          onRequestMarkText={handleRequestMarkText}
          onRequestScreenshot={handleRequestScreenshot}
        />
      </div>
      <CanvasEditor
        document={document}
        onDocumentTextReady={handleDocumentTextReady}
        materialId={materialId}
        onAskAiWithContext={handleAskAiWithContext}
        onToolSwitchReady={handleToolSwitchReady}
      />
    </>
  );
}
