'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createVersionSnapshot } from '@/lib/actions/document-versions';

const IDLE_TIMEOUT_MS = 30_000; // 30 seconds
const PERIODIC_INTERVAL_MS = 300_000; // 5 minutes

interface UseVersionSnapshotsOptions {
  documentId: string;
  /** Returns a string that changes when document content changes. */
  getContentHash: () => string;
}

export function useVersionSnapshots({
  documentId,
  getContentHash,
}: UseVersionSnapshotsOptions) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSnapshotHashRef = useRef<string | null>(null);
  const getContentHashRef = useRef(getContentHash);
  const documentIdRef = useRef(documentId);

  // Keep refs in sync
  useEffect(() => {
    getContentHashRef.current = getContentHash;
  }, [getContentHash]);

  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  const trySnapshot = useCallback(
    async (trigger: 'idle' | 'periodic' | 'close') => {
      const hash = getContentHashRef.current();

      // Skip if content hasn't changed since last snapshot
      if (hash === lastSnapshotHashRef.current) return;

      try {
        await createVersionSnapshot(documentIdRef.current, trigger);
        lastSnapshotHashRef.current = hash;
      } catch {
        // Snapshot failed — don't update hash, try again next time
      }
    },
    [],
  );

  // Start periodic timer on mount
  useEffect(() => {
    periodicTimerRef.current = setInterval(() => {
      trySnapshot('periodic');
    }, PERIODIC_INTERVAL_MS);

    return () => {
      if (periodicTimerRef.current) {
        clearInterval(periodicTimerRef.current);
      }
    };
  }, [trySnapshot]);

  // Called whenever the user makes an edit (from triggerSave)
  const onActivity = useCallback(() => {
    // Reset idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      trySnapshot('idle');
    }, IDLE_TIMEOUT_MS);
  }, [trySnapshot]);

  // Session close: beforeunload + visibilitychange
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability on page close
      try {
        navigator.sendBeacon(
          '/api/version-snapshot',
          JSON.stringify({ documentId: documentIdRef.current }),
        );
      } catch {
        // Fallback — best effort
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        trySnapshot('close');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [trySnapshot]);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  return { onActivity };
}
