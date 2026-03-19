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
      {/* Floating chat bubble — bottom-left to avoid right sidebar overlap */}
      {!isOpen && (
        <button
          onClick={handleToggle}
          className="fixed z-40 flex items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-purple-700 active:scale-95"
          style={{ bottom: 16, right: 64, width: 44, height: 44 }}
          aria-label="Open AI chat"
        >
          <MessageCircle className="h-5 w-5" />
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
