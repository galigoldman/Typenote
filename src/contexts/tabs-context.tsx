'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import type { OpenTab, TabSession } from '@/types/tabs';

const STORAGE_KEY = 'typenote:tabs';

interface TabsContextValue {
  tabs: OpenTab[];
  activeTabId: string | null;
  openTab: (documentId: string, title: string) => void;
  closeTab: (documentId: string) => void;
  switchTab: (documentId: string) => void;
  registerTab: (documentId: string, title: string) => void;
  updateTabTitle: (documentId: string, title: string) => void;
}

const TabsContext = createContext<TabsContextValue>({
  tabs: [],
  activeTabId: null,
  openTab: () => {},
  closeTab: () => {},
  switchTab: () => {},
  registerTab: () => {},
  updateTabTitle: () => {},
});

export const useTabs = () => useContext(TabsContext);

// ---- External store for tab session (avoids setState-in-effect) ----

const EMPTY_SESSION: TabSession = { tabs: [], activeTabId: null };
let currentSession: TabSession = EMPTY_SESSION;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TabSession {
  return currentSession;
}

function getServerSnapshot(): TabSession {
  return EMPTY_SESSION;
}

function loadFromStorage(): TabSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SESSION;
    const parsed = JSON.parse(raw) as TabSession;
    if (!Array.isArray(parsed.tabs)) return EMPTY_SESSION;
    return parsed;
  } catch {
    return EMPTY_SESSION;
  }
}

function saveToStorage(session: TabSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function updateSession(updater: (prev: TabSession) => TabSession) {
  const next = updater(currentSession);
  if (next !== currentSession) {
    currentSession = next;
    saveToStorage(next);
    emitChange();
  }
}

// Hydrate on first client-side import
if (typeof window !== 'undefined') {
  currentSession = loadFromStorage();
}

// ---- Provider ----

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const tabs = session.tabs;
  const activeTabId = session.activeTabId;

  const openTab = useCallback(
    (documentId: string, title: string) => {
      updateSession((prev) => {
        const exists = prev.tabs.find((t) => t.documentId === documentId);
        return {
          tabs: exists ? prev.tabs : [...prev.tabs, { documentId, title }],
          activeTabId: documentId,
        };
      });
      router.push(`/dashboard/documents/${documentId}`);
    },
    [router],
  );

  const closeTab = useCallback(
    (documentId: string) => {
      updateSession((prev) => {
        const idx = prev.tabs.findIndex((t) => t.documentId === documentId);
        if (idx === -1) return prev;

        const next = prev.tabs.filter((t) => t.documentId !== documentId);

        if (prev.activeTabId === documentId) {
          if (next.length === 0) {
            router.push('/dashboard');
            return { tabs: next, activeTabId: null };
          }
          const newIdx = Math.min(idx, next.length - 1);
          const newActive = next[newIdx].documentId;
          router.push(`/dashboard/documents/${newActive}`);
          return { tabs: next, activeTabId: newActive };
        }

        return { tabs: next, activeTabId: prev.activeTabId };
      });
    },
    [router],
  );

  const switchTab = useCallback(
    (documentId: string) => {
      updateSession((prev) => ({ ...prev, activeTabId: documentId }));
      router.push(`/dashboard/documents/${documentId}`);
    },
    [router],
  );

  const registerTab = useCallback((documentId: string, title: string) => {
    updateSession((prev) => {
      const exists = prev.tabs.find((t) => t.documentId === documentId);
      return {
        tabs: exists ? prev.tabs : [...prev.tabs, { documentId, title }],
        activeTabId: documentId,
      };
    });
  }, []);

  const updateTabTitle = useCallback((documentId: string, title: string) => {
    updateSession((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.documentId === documentId ? { ...t, title } : t,
      ),
    }));
  }, []);

  const value = useMemo<TabsContextValue>(
    () => ({
      tabs,
      activeTabId,
      openTab,
      closeTab,
      switchTab,
      registerTab,
      updateTabTitle,
    }),
    [
      tabs,
      activeTabId,
      openTab,
      closeTab,
      switchTab,
      registerTab,
      updateTabTitle,
    ],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}
