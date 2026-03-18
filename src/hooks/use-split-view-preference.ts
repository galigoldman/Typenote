'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'typenote:split-view-enabled';

function getSnapshot(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== null ? stored === 'true' : true;
}

function getServerSnapshot(): boolean {
  return true; // Default to enabled on server
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function useSplitViewPreference() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    // Trigger re-render by dispatching a storage event
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }, []);

  return { splitViewEnabled: enabled, setSplitViewEnabled: setEnabled };
}
