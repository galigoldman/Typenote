'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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

function loadTabSession(): TabSession {
  if (typeof window === 'undefined') return { tabs: [], activeTabId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null };
    const parsed = JSON.parse(raw) as TabSession;
    if (!Array.isArray(parsed.tabs)) return { tabs: [], activeTabId: null };
    return parsed;
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

function saveTabSession(session: TabSession) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Start with empty state to avoid hydration mismatch (server has no localStorage).
  // Hydrate from localStorage after mount using a ref to avoid cascading renders.
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate from localStorage after mount (single batched update)
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const session = loadTabSession();
    if (session.tabs.length > 0 || session.activeTabId) {
      setTabs(session.tabs);
      setActiveTabId(session.activeTabId);
    }
  }, []);

  // Persist to localStorage whenever tabs/activeTabId change (only after hydration)
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveTabSession({ tabs, activeTabId });
  }, [tabs, activeTabId]);

  const openTab = useCallback(
    (documentId: string, title: string) => {
      setTabs((prev) => {
        const exists = prev.find((t) => t.documentId === documentId);
        if (exists) return prev;
        return [...prev, { documentId, title }];
      });
      setActiveTabId(documentId);
      router.push(`/dashboard/documents/${documentId}`);
    },
    [router],
  );

  const closeTab = useCallback(
    (documentId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.documentId === documentId);
        if (idx === -1) return prev;

        const next = prev.filter((t) => t.documentId !== documentId);

        // If closing the active tab, switch to adjacent
        if (activeTabId === documentId) {
          if (next.length === 0) {
            setActiveTabId(null);
            router.push('/dashboard');
          } else {
            // Prefer right neighbor, fall back to left
            const newIdx = Math.min(idx, next.length - 1);
            const newActive = next[newIdx].documentId;
            setActiveTabId(newActive);
            router.push(`/dashboard/documents/${newActive}`);
          }
        }

        return next;
      });
    },
    [activeTabId, router],
  );

  const switchTab = useCallback(
    (documentId: string) => {
      setActiveTabId(documentId);
      router.push(`/dashboard/documents/${documentId}`);
    },
    [router],
  );

  // Register a tab without triggering navigation (used when landing on a document page directly)
  const registerTab = useCallback((documentId: string, title: string) => {
    setTabs((prev) => {
      const exists = prev.find((t) => t.documentId === documentId);
      if (exists) return prev;
      return [...prev, { documentId, title }];
    });
    setActiveTabId(documentId);
  }, []);

  // Update a tab's title (e.g., when the user renames a document)
  const updateTabTitle = useCallback((documentId: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.documentId === documentId ? { ...t, title } : t)),
    );
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
