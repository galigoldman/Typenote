import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheDocument } from '@/lib/offline/document-cache';
import { queueEdit, type PendingEdit } from '@/lib/offline/sync-queue';
import { markDocumentDirty } from '@/lib/offline/document-cache';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface SaveResult {
  updated_at: string;
}

export interface AutoSaveOfflineContext {
  documentId: string;
  title: string;
  getContent: () => Record<string, unknown> | undefined;
}

export function useAutoSave(
  saveFn: () => Promise<SaveResult | void>,
  debounceMs: number = 800,
  offlineContext?: AutoSaveOfflineContext,
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(saveFn);
  const lastSaveTimestampRef = useRef<string | null>(null);
  const offlineContextRef = useRef(offlineContext);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    offlineContextRef.current = offlineContext;
  }, [offlineContext]);

  const performSave = useCallback(async () => {
    setStatus('saving');
    try {
      const result = await saveFnRef.current();
      if (result?.updated_at) {
        lastSaveTimestampRef.current = result.updated_at;
      }
      setStatus('saved');

      // On successful save, update the offline cache
      const ctx = offlineContextRef.current;
      if (ctx) {
        const content = ctx.getContent();
        if (content) {
          cacheDocument({
            id: ctx.documentId,
            title: ctx.title,
            content,
            updated_at: result?.updated_at ?? new Date().toISOString(),
          }).catch(() => {
            // Silently ignore cache write failures
          });
        }
      }
    } catch {
      setStatus('unsaved');

      // On save failure, queue the edit for later sync and mark as dirty
      const ctx = offlineContextRef.current;
      if (ctx) {
        const content = ctx.getContent();
        if (content) {
          const edit: Omit<PendingEdit, 'id'> = {
            document_id: ctx.documentId,
            field: 'content',
            value: content,
            timestamp: new Date().toISOString(),
          };
          queueEdit(edit).catch(() => {});
          markDocumentDirty(ctx.documentId).catch(() => {});
        }
      }
    }
  }, []);

  const trigger = useCallback(() => {
    setStatus('unsaved');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(performSave, debounceMs);
  }, [debounceMs, performSave]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (status === 'unsaved') {
      await performSave();
    }
  }, [status, performSave]);

  // beforeunload handler
  useEffect(() => {
    const handler = () => {
      flush();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flush]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { status, trigger, flush, lastSaveTimestampRef };
}
