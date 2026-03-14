'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

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

  // Auto-hide sidebar on document pages, show on dashboard
  const [sidebarOpen, setSidebarOpen] = useState(!isDocumentPage);

  // Update sidebar state when navigating between pages
  useEffect(() => {
    setSidebarOpen(!isDocumentPage);
  }, [isDocumentPage]);

  const toggle = () => setSidebarOpen((prev) => !prev);

  return (
    <SidebarContext.Provider value={{ isOpen: sidebarOpen, toggle }}>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside
          className={`flex shrink-0 flex-col border-r bg-muted/30 transition-[width] duration-200 overflow-hidden ${
            sidebarOpen ? 'w-[250px]' : 'w-0 border-r-0'
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
