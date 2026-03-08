'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarFolderTree } from '@/components/dashboard/sidebar-folder-tree';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { signOut } from '@/lib/actions/auth';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState<string | null>(null);
  const pathname = usePathname();
  const { isOnline } = useNetworkStatus();

  // Close sidebar when the route changes (mobile navigation).
  // This uses the "derive state from props" pattern recommended by React:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (sidebarOpen) {
      setSidebarOpen(false);
    }
  }

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen">
      {/* Backdrop overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[250px] shrink-0 flex-col border-r bg-muted/30
          pl-[env(safe-area-inset-left)]
          transition-transform duration-200 ease-in-out
          lg:static lg:z-auto lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        data-testid="sidebar"
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Typenote</h1>
            {!isOnline && (
              <span
                className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                data-testid="dashboard-offline-badge"
              >
                <WifiOff className="size-3" />
                Offline
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="lg:hidden"
            onClick={closeSidebar}
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </Button>
        </div>
        <Separator />
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <SidebarFolderTree />
        </div>
        <Separator />
        <div className="p-2">
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {/* Mobile header with hamburger toggle */}
        <div className="sticky top-0 z-30 flex h-14 items-center border-b bg-background px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            data-testid="sidebar-toggle"
          >
            <Menu className="size-5" />
          </Button>
          <span className="ml-3 text-lg font-bold">Typenote</span>
          {!isOnline && (
            <span
              className="ml-2 flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
              data-testid="dashboard-offline-badge-mobile"
            >
              <WifiOff className="size-3" />
              Offline
            </span>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
