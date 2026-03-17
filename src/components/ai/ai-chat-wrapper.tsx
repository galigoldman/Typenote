'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { AiContextItem } from './ai-chat-panel';

import { AiChatPanel } from './ai-chat-panel';

interface AiChatWrapperProps {
  courseId: string;
  weekId?: string;
  courseName?: string;
  weekLabel?: string;
  getDocumentContent?: () => string;
  pendingContextItems?: AiContextItem[];
  onRemoveContextItem?: (index: number) => void;
  onClearAllContext?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  onRequestMarkText?: () => void;
  onRequestScreenshot?: () => void;
}

export function AiChatWrapper({
  courseId,
  weekId,
  courseName,
  weekLabel,
  getDocumentContent,
  pendingContextItems = [],
  onRemoveContextItem,
  onClearAllContext,
  isOpen: externalIsOpen,
  onToggle: externalOnToggle,
  onClose: externalOnClose,
  onRequestMarkText,
  onRequestScreenshot,
}: AiChatWrapperProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalIsOpen;
  const handleToggle = isControlled
    ? externalOnToggle!
    : () => setInternalIsOpen((prev) => !prev);
  const handleClose = isControlled
    ? externalOnClose!
    : () => setInternalIsOpen(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggle}
        className={
          isOpen
            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
            : ''
        }
      >
        <Sparkles className="mr-1.5 h-4 w-4" />
        Ask AI
      </Button>

      <AiChatPanel
        courseId={courseId}
        weekId={weekId}
        courseName={courseName}
        weekLabel={weekLabel}
        getDocumentContent={getDocumentContent}
        isOpen={isOpen}
        onClose={handleClose}
        pendingContextItems={pendingContextItems}
        onRemoveContextItem={onRemoveContextItem}
        onClearAllContext={onClearAllContext}
        onRequestMarkText={onRequestMarkText}
        onRequestScreenshot={onRequestScreenshot}
      />
    </>
  );
}
