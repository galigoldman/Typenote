'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PendingAiContext } from './ai-chat-panel';

import { AiChatPanel } from './ai-chat-panel';

interface AiChatWrapperProps {
  courseId: string;
  weekId?: string;
  courseName?: string;
  weekLabel?: string;
  getDocumentContent?: () => string;
  pendingContext?: PendingAiContext;
  onContextCleared?: () => void;
  /** When provided, the parent controls open state. Otherwise internal state is used. */
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export function AiChatWrapper({
  courseId,
  weekId,
  courseName,
  weekLabel,
  getDocumentContent,
  pendingContext,
  onContextCleared,
  isOpen: externalIsOpen,
  onToggle: externalOnToggle,
  onClose: externalOnClose,
}: AiChatWrapperProps) {
  // Internal state fallback when parent doesn't control open state
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
        pendingContext={pendingContext}
        onContextCleared={onContextCleared}
      />
    </>
  );
}
