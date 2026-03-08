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
import type { CanvasDocument } from '@/lib/canvas/types';

interface UseCanvasSyncOptions {
  documentId: string;
  canvasDoc: CanvasDocument;
  title: string;
  isDirty: boolean;
  onRemoteCanvasUpdate: (content: CanvasDocument) => void;
  onRemoteTitleUpdate: (title: string) => void;
}

interface UseCanvasSyncReturn {
  saveStatus: SaveStatus;
  connectionStatus: ConnectionStatus;
  isLockedByRemote: boolean;
  unlockEditor: () => void;
  triggerSave: () => void;
  flushSave: () => Promise<void>;
  saveTitle: (title: string) => Promise<void>;
}

export function useCanvasSync({
  documentId,
  canvasDoc,
  title,
  isDirty,
  onRemoteCanvasUpdate,
  onRemoteTitleUpdate,
}: UseCanvasSyncOptions): UseCanvasSyncReturn {
  const [isLockedByRemote, setIsLockedByRemote] = useState(false);
  const { isOnline } = useNetworkStatus();
  const prevOnlineRef = useRef(isOnline);
  const canvasDocRef = useRef(canvasDoc);

  useEffect(() => {
    canvasDocRef.current = canvasDoc;
  }, [canvasDoc]);

  // Serialize the full canvas state to JSONB
  const saveFn = useCallback(async () => {
    const content = canvasDocRef.current as unknown as Record<string, unknown>;
    return updateDocumentContent(documentId, JSON.stringify(content));
  }, [documentId]);

  const offlineContext: AutoSaveOfflineContext = {
    documentId,
    title,
    getContent: () => canvasDocRef.current as unknown as Record<string, unknown>,
  };

  const {
    status: saveStatus,
    trigger: triggerSave,
    flush: flushSave,
    lastSaveTimestampRef,
  } = useAutoSave(saveFn, 800, offlineContext);

  // Trigger auto-save when canvas state changes
  useEffect(() => {
    if (isDirty) {
      triggerSave();
    }
  }, [isDirty, canvasDoc, triggerSave]);

  // Handle remote content updates — apply canvas-specific diffing
  const onRemoteContentUpdate = useCallback(
    (content: Record<string, unknown>) => {
      if (content.format === 'canvas') {
        // Preserve local viewport — don't jump to remote user's position
        const remoteCanvas = content as unknown as CanvasDocument;
        const localViewport = canvasDocRef.current.viewport;
        const merged: CanvasDocument = {
          ...remoteCanvas,
          viewport: localViewport,
        };
        onRemoteCanvasUpdate(merged);
        setIsLockedByRemote(true);
      }
    },
    [onRemoteCanvasUpdate],
  );

  const { connectionStatus } = useRealtimeSync({
    documentId,
    lastSaveTimestampRef,
    onRemoteContentUpdate,
    onRemoteTitleUpdate,
  });

  // Flush pending edits when coming back online
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (isOnline && wasOffline) {
      (async () => {
        try {
          const pendingEdits = await getPendingEdits();
          for (const edit of pendingEdits) {
            try {
              if (edit.field === 'content') {
                const result = await updateDocumentContent(
                  edit.document_id,
                  JSON.stringify(edit.value),
                );
                lastSaveTimestampRef.current = result.updated_at;
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
              break;
            }
          }
        } catch {
          // Ignore queue read errors
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
    saveTitle,
  };
}
