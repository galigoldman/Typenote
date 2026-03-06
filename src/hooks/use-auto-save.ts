import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export function useAutoSave(
  saveFn: () => Promise<void>,
  debounceMs: number = 800,
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(saveFn);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const trigger = useCallback(() => {
    setStatus('unsaved');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setStatus('saving');
      try {
        await saveFnRef.current();
        setStatus('saved');
      } catch {
        setStatus('unsaved');
      }
    }, debounceMs);
  }, [debounceMs]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (status === 'unsaved') {
      setStatus('saving');
      try {
        await saveFnRef.current();
        setStatus('saved');
      } catch {
        setStatus('unsaved');
      }
    }
  }, [status]);

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

  return { status, trigger, flush };
}
