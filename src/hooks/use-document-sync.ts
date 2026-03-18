'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAutoSave,
  type SaveStatus,
  type SaveErrorType,
} from './use-auto-save';
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
  manualSave: () => Promise<void>;
  retryCount: number;
  errorDetails: string | null;
  errorType: SaveErrorType;
  retryNow: () => void;
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
    retryCount,
    errorDetails,
    errorType,
    retryNow,
  } = useAutoSave(saveFn);

  const manualSave = useCallback(async () => {
    await flushSave();
  }, [flushSave]);

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

  // Reconnection-triggered retry
  const prevConnectionRef = useRef(connectionStatus);

  useEffect(() => {
    const prevStatus = prevConnectionRef.current;
    prevConnectionRef.current = connectionStatus;

    // If connection was disconnected and is now connected, retry pending saves
    if (prevStatus === 'disconnected' && connectionStatus === 'connected') {
      if (saveStatus === 'error' || saveStatus === 'retrying') {
        retryNow();
      }
    }
  }, [connectionStatus, saveStatus, retryNow]);

  // Browser online event for reconnection retry
  useEffect(() => {
    const handleOnline = () => {
      if (saveStatus === 'error' || saveStatus === 'retrying') {
        retryNow();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [saveStatus, retryNow]);

  // Browser confirmation dialog for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (
        saveStatus === 'unsaved' ||
        saveStatus === 'retrying' ||
        saveStatus === 'error'
      ) {
        e.preventDefault();
        e.returnValue =
          'You have unsaved changes. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

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
    manualSave,
    retryCount,
    errorDetails,
    errorType,
    retryNow,
  };
}
