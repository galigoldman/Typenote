'use client';

import { useCallback, useState } from 'react';
import { useAutoSave, type SaveStatus } from './use-auto-save';
import { useRealtimeSync, type ConnectionStatus } from './use-realtime-sync';
import {
  updateDocumentContent,
  updateDocumentTitle,
} from '@/lib/actions/documents';
import type { Editor } from '@tiptap/core';

interface UseDocumentSyncOptions {
  documentId: string;
  editor: Editor | null;
  onRemoteTitleUpdate: (title: string) => void;
  getPagesData?: () => Record<string, unknown> | undefined;
  onRemotePagesUpdate?: (pages: Record<string, unknown>) => void;
}

interface UseDocumentSyncReturn {
  saveStatus: SaveStatus;
  connectionStatus: ConnectionStatus;
  isLockedByRemote: boolean;
  unlockEditor: () => void;
  triggerSave: () => void;
  flushSave: () => Promise<void>;
  lastSaveTimestampRef: React.RefObject<string | null>;
  saveTitle: (title: string) => Promise<void>;
}

export function useDocumentSync({
  documentId,
  editor,
  onRemoteTitleUpdate,
  getPagesData,
  onRemotePagesUpdate,
}: UseDocumentSyncOptions): UseDocumentSyncReturn {
  const [isLockedByRemote, setIsLockedByRemote] = useState(false);

  const saveFn = useCallback(async () => {
    const content = editor
      ? (editor.getJSON() as Record<string, unknown>)
      : ({} as Record<string, unknown>);
    const pages = getPagesData?.();
    // Send as JSON string to prevent Next.js Server Actions from stripping nested attrs
    return updateDocumentContent(documentId, JSON.stringify(content), pages);
  }, [editor, documentId, getPagesData]);

  const {
    status: saveStatus,
    trigger: triggerSave,
    flush: flushSave,
    lastSaveTimestampRef,
  } = useAutoSave(saveFn);

  const onRemoteContentUpdate = useCallback(
    (content: Record<string, unknown>) => {
      if (!editor) return;
      editor.commands.setContent(content, { emitUpdate: false });
      setIsLockedByRemote(true);
    },
    [editor],
  );

  const { connectionStatus } = useRealtimeSync({
    documentId,
    lastSaveTimestampRef,
    onRemoteContentUpdate,
    onRemoteTitleUpdate,
    onRemotePagesUpdate,
  });

  const saveTitle = useCallback(
    async (title: string) => {
      const result = await updateDocumentTitle(documentId, title);
      lastSaveTimestampRef.current = result.updated_at;
    },
    [documentId, lastSaveTimestampRef],
  );

  const unlockEditor = useCallback(() => {
    setIsLockedByRemote(false);
  }, []);

  return {
    saveStatus,
    connectionStatus,
    isLockedByRemote,
    unlockEditor,
    triggerSave,
    flushSave,
    lastSaveTimestampRef,
    saveTitle,
  };
}
