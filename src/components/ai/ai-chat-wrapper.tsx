'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

import type { AiContextItem } from './ai-chat-panel';
import type { ContextFileType, ResolvedContextFile } from '@/types/database';

import { AiChatPanel } from './ai-chat-panel';

interface AiChatWrapperProps {
  courseId?: string;
  courseName?: string;
  documentId?: string;
  getDocumentContent?: () => string;
  pendingContextItems?: AiContextItem[];
  onRemoveContextItem?: (index: number) => void;
  onClearAllContext?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  onOpenSource?: (
    fileType: ContextFileType,
    fileId: string,
    page?: number,
  ) => void;
  /** Per-document focus files (owned by the host) + a reload callback. */
  focusFiles?: ResolvedContextFile[];
  onFocusFilesChanged?: () => void | Promise<void>;
}

export function AiChatWrapper({
  courseId,
  courseName,
  documentId,
  getDocumentContent,
  pendingContextItems = [],
  onRemoveContextItem,
  onClearAllContext,
  isOpen: externalIsOpen,
  onToggle: externalOnToggle,
  onClose: externalOnClose,
  onOpenSource,
  focusFiles,
  onFocusFilesChanged,
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
          className="fixed z-40 flex items-center justify-center rounded-full bg-[#6355C0] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#554AAD] active:scale-95"
          style={{ bottom: 16, right: 64, width: 44, height: 44 }}
          aria-label="Open AI chat"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      <AiChatPanel
        courseId={courseId}
        courseName={courseName}
        documentId={documentId}
        getDocumentContent={getDocumentContent}
        isOpen={isOpen}
        onClose={handleClose}
        pendingContextItems={pendingContextItems}
        onRemoveContextItem={onRemoveContextItem}
        onClearAllContext={onClearAllContext}
        onOpenSource={onOpenSource}
        focusFiles={focusFiles}
        onFocusFilesChanged={onFocusFilesChanged}
      />
    </>
  );
}
