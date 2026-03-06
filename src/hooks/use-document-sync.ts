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
}: UseDocumentSyncOptions): UseDocumentSyncReturn {
  const [isLockedByRemote, setIsLockedByRemote] = useState(false);

  const saveFn = useCallback(async () => {
    if (!editor) return;
    const content = editor.getJSON() as Record<string, unknown>;
    return updateDocumentContent(documentId, content);
  }, [editor, documentId]);

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
