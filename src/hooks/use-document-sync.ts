'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAutoSave,
  type SaveStatus,
  type AutoSaveOfflineContext,
} from './use-auto-save';
import { useRealtimeSync, type ConnectionStatus } from './use-realtime-sync';
import { useNetworkStatus } from './use-network-status';
import {
  updateDocumentContent,
  updateDocumentTitle,
} from '@/lib/actions/documents';
import { getPendingEdits, removePendingEdit } from '@/lib/offline/sync-queue';
import { cacheDocument } from '@/lib/offline/document-cache';
import type { Editor } from '@tiptap/core';

interface UseDocumentSyncOptions {
  documentId: string;
  editor: Editor | null;
  title: string;
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
  title,
  onRemoteTitleUpdate,
}: UseDocumentSyncOptions): UseDocumentSyncReturn {
  const [isLockedByRemote, setIsLockedByRemote] = useState(false);
  const { isOnline } = useNetworkStatus();
  const prevOnlineRef = useRef(isOnline);

  const saveFn = useCallback(async () => {
    if (!editor) return;
    const content = editor.getJSON() as Record<string, unknown>;
    // Send as JSON string to prevent Next.js Server Actions from stripping nested attrs
    return updateDocumentContent(documentId, JSON.stringify(content));
  }, [editor, documentId]);

  const offlineContext: AutoSaveOfflineContext = {
    documentId,
    title,
    getContent: () => editor?.getJSON() as Record<string, unknown> | undefined,
  };

  const {
    status: saveStatus,
    trigger: triggerSave,
    flush: flushSave,
    lastSaveTimestampRef,
  } = useAutoSave(saveFn, 800, offlineContext);

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

  // Flush pending edits from the sync queue when we come back online
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (isOnline && wasOffline) {
      // Process the offline sync queue
      (async () => {
        try {
          const pendingEdits = await getPendingEdits();
          for (const edit of pendingEdits) {
            try {
              if (edit.field === 'content') {
                const result = await updateDocumentContent(
                  edit.document_id,
                  edit.value as Record<string, unknown>,
                );
                lastSaveTimestampRef.current = result.updated_at;

                // Update the cache after successful sync
                await cacheDocument({
                  id: edit.document_id,
                  title,
                  content: edit.value as Record<string, unknown>,
                  updated_at: result.updated_at,
                });
              } else if (edit.field === 'title') {
                const result = await updateDocumentTitle(
                  edit.document_id,
                  edit.value as string,
                );
                lastSaveTimestampRef.current = result.updated_at;
              }
              await removePendingEdit(edit.id);
            } catch {
              // If flushing a single edit fails, stop processing.
              // The remaining edits stay in the queue for the next reconnect.
              break;
            }
          }
        } catch {
          // Ignore errors reading the queue
        }
      })();
    }
  }, [isOnline, lastSaveTimestampRef, title]);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      const result = await updateDocumentTitle(documentId, newTitle);
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
