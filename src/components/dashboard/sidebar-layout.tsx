'use client';

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';

// Simple toggle store to avoid setState-in-effect issues
function createSidebarStore(initialOpen: boolean) {
  let isOpen = initialOpen;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => isOpen,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    toggle: () => {
      isOpen = !isOpen;
      listeners.forEach((cb) => cb());
    },
    set: (value: boolean) => {
      if (isOpen !== value) {
        isOpen = value;
        listeners.forEach((cb) => cb());
      }
    },
  };
}

// Context so child components (e.g. canvas editor header) can toggle the sidebar
const SidebarContext = createContext<{
  isOpen: boolean;
  toggle: () => void;
}>({ isOpen: true, toggle: () => {} });

export const useSidebar = () => useContext(SidebarContext);

interface SidebarLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function SidebarLayout({ sidebar, children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const isDocumentPage = pathname.includes('/documents/');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- store is stable per mount
  const store = useMemo(() => createSidebarStore(!isDocumentPage), []);

  // Sync sidebar open/close when route changes
  store.set(!isDocumentPage);

  const isOpen = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return (
    <SidebarContext.Provider value={{ isOpen, toggle: store.toggle }}>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside
          className={`flex shrink-0 flex-col border-r bg-muted/30 transition-[width] duration-200 overflow-hidden ${
            isOpen ? 'w-[250px]' : 'w-0 border-r-0'
          }`}
        >
          <div className="w-[250px] flex flex-col h-full">{sidebar}</div>
        </aside>

        {/* Main content — overflow-hidden so document pages control their own scroll */}
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
