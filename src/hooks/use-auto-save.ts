import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'retrying' | 'error';
export type SaveErrorType = 'network' | 'auth' | 'permanent' | null;

export interface SaveResult {
  updated_at: string;
}

function classifyError(error: unknown): {
  errorType: SaveErrorType;
  message: string;
  retryable: boolean;
} {
  // TypeError = network failure (fetch failed)
  if (error instanceof TypeError) {
    return {
      errorType: 'network',
      message: 'Network error — check your connection',
      retryable: true,
    };
  }

  // Check for Response-like objects with status codes
  // The save function (server action) throws errors — we need to check the message
  // for status code patterns or wrap them appropriately
  const message = error instanceof Error ? error.message : String(error);

  // Auth errors
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('Not authenticated')
  ) {
    return {
      errorType: 'auth',
      message: 'Session expired — please sign in again',
      retryable: false,
    };
  }

  // Transient server errors (worth retrying)
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return {
      errorType: 'network',
      message: 'Server error — retrying...',
      retryable: true,
    };
  }

  // Everything else is permanent
  return {
    errorType: 'permanent',
    message: message || 'Save failed',
    retryable: false,
  };
}

export function useAutoSave(
  saveFn: () => Promise<SaveResult | void>,
  debounceMs: number = 800,
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [retryCount, setRetryCount] = useState(0);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<SaveErrorType>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(saveFn);
  const lastSaveTimestampRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const performSaveRef = useRef<(() => Promise<void>) | undefined>(undefined);

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
      retryCountRef.current = 0;
      setRetryCount(0);
      setErrorDetails(null);
      setErrorType(null);
    } catch (error) {
      const classified = classifyError(error);

      if (classified.retryable && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        setStatus('retrying');
        setErrorDetails(classified.message);
        setErrorType(classified.errorType);

        const delay = 1000 * Math.pow(2, retryCountRef.current - 1);
        retryTimeoutRef.current = setTimeout(
          () => performSaveRef.current?.(),
          delay,
        );
      } else {
        setStatus('error');
        setErrorDetails(classified.message);
        setErrorType(classified.errorType);
      }
    }
  }, []);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  const trigger = useCallback(() => {
    setStatus('unsaved');
    retryCountRef.current = 0;
    setRetryCount(0);
    setErrorDetails(null);
    setErrorType(null);
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(performSave, debounceMs);
  }, [debounceMs, performSave]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    await performSave();
  }, [performSave]);

  const retryNow = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryCountRef.current = 0;
    setRetryCount(0);
    performSave();
  }, [performSave]);

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
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  return {
    status,
    trigger,
    flush,
    lastSaveTimestampRef,
    retryCount,
    errorDetails,
    errorType,
    retryNow,
  };
}
