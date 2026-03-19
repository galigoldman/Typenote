'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

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
      {/* Floating chat bubble — bottom right */}
      {!isOpen && (
        <button
          onClick={handleToggle}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-purple-700 active:scale-95 max-xl:bottom-4 max-xl:right-auto max-xl:left-20 max-xl:h-11 max-xl:w-11"
          aria-label="Open AI chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

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
      />
    </>
  );
}
