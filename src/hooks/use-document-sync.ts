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
  isLockedByRemoteRef: React.RefObject<boolean>;
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
  isLockedByRemoteRef,
}: UseDocumentSyncOptions): UseDocumentSyncReturn {
  const [isLockedByRemote, setIsLockedByRemote] = useState(false);

  const saveFn = useCallback(async () => {
    if (!editor) return;
    // Don't save while locked by remote
    if (isLockedByRemoteRef.current) return;
    const content = editor.getJSON() as Record<string, unknown>;
    // Don't save if any inlineMath node has empty latex (still being edited)
    const hasEmptyMath = JSON.stringify(content).includes('"latex":""');
    if (hasEmptyMath) return;
    return updateDocumentContent(documentId, content);
  }, [editor, documentId, isLockedByRemoteRef]);

  const {
    status: saveStatus,
    trigger: triggerSave,
    flush: flushSave,
    lastSaveTimestampRef,
  } = useAutoSave(saveFn);

  const onRemoteContentUpdate = useCallback(
    (content: Record<string, unknown>) => {
      if (!editor) return;
      // Set ref synchronously BEFORE setContent so that onUpdate (which may
      // fire during the React re-render caused by setIsLockedByRemote) sees it.
      isLockedByRemoteRef.current = true;
      editor.commands.setContent(content, { emitUpdate: false });
      setIsLockedByRemote(true);
    },
    [editor, isLockedByRemoteRef],
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
    isLockedByRemoteRef.current = false;
    setIsLockedByRemote(false);
  }, [isLockedByRemoteRef]);

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
