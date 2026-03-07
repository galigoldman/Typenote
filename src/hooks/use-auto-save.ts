import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface SaveResult {
  updated_at: string;
}

export function useAutoSave(
  saveFn: () => Promise<SaveResult | void>,
  debounceMs: number = 800,
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(saveFn);
  const lastSaveTimestampRef = useRef<string | null>(null);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const performSave = useCallback(async () => {
    setStatus('saving');
    try {
      const result = await saveFnRef.current();
      if (result?.updated_at) {
        lastSaveTimestampRef.current = result.updated_at;
      }
      setStatus('saved');
    } catch (err) {
      setStatus('unsaved');
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

  // Stable immediate save — bypasses debounce, always saves current content.
  // Unlike `flush` (which depends on `status`), this has no reactive deps
  // so it's safe to store in long-lived refs like editor.storage.
  const flushNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await performSave();
  }, [performSave]);

  return { status, trigger, flush, flushNow, lastSaveTimestampRef };
}
