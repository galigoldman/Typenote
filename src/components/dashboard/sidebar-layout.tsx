'use client';

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Home, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TabBar } from '@/components/tabs/tab-bar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSwipeDrawer } from '@/hooks/use-swipe-drawer';
import { VisuallyHidden } from 'radix-ui';

const STORAGE_KEY = 'typenote-sidebar-collapsed';

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

const SidebarContext = createContext<{
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  close: () => void;
}>({ isOpen: true, isMobile: false, toggle: () => {}, close: () => {} });

export const useSidebar = () => useContext(SidebarContext);

interface SidebarLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function SidebarLayout({ sidebar, children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isDocumentPage = pathname.includes('/documents/');
  const isDashboardRoot = pathname === '/dashboard';
  // Use 1280px (xl) so iPads get the mobile sheet pattern — the inline
  // sidebar wastes space on tablets where users primarily use touch.
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const isMobile = !isDesktop;

  // Mobile sheet state
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Desktop sidebar store with localStorage persistence
  const store = useMemo(() => {
    let initial = !isDocumentPage;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'true') initial = false;
    }
    return createSidebarStore(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store is stable per mount
  }, []);

  // Track previous pathname to only sync on route CHANGES, not every render.
  // Deferred via queueMicrotask to avoid setState-during-render warnings.
  const prevIsDocRef = useMemo(() => ({ current: isDocumentPage }), []);
  if (prevIsDocRef.current !== isDocumentPage) {
    prevIsDocRef.current = isDocumentPage;
    const nextValue = !isDocumentPage;
    queueMicrotask(() => store.set(nextValue));
  }

  const isOpen = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const toggle = useMemo(() => {
    if (isMobile) {
      return () => setIsSheetOpen((prev) => !prev);
    }
    return () => {
      store.toggle();
      const next = store.getSnapshot();
      localStorage.setItem(STORAGE_KEY, String(!next));
    };
  }, [isMobile, store]);

  const close = useMemo(() => {
    if (isMobile) {
      return () => setIsSheetOpen(false);
    }
    return () => {
      store.set(false);
      localStorage.setItem(STORAGE_KEY, 'true');
    };
  }, [isMobile, store]);

  // Swipe gesture for mobile drawer
  const layoutRef = useRef<HTMLDivElement>(null);
  useSwipeDrawer(layoutRef, {
    onOpen: () => setIsSheetOpen(true),
    onClose: () => setIsSheetOpen(false),
    isOpen: isSheetOpen,
    enabled: isMobile,
  });

  const contextValue = useMemo(
    () => ({
      isOpen: isMobile ? isSheetOpen : isOpen,
      isMobile,
      toggle,
      close,
    }),
    [isMobile, isSheetOpen, isOpen, toggle, close],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        ref={layoutRef}
        className="flex h-dvh min-h-dvh flex-col xl:flex-row"
      >
        {/* Navigation header — visible on mobile + iPad, hidden on document pages and xl+ desktop */}
        {!isDocumentPage && (
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/30 bg-sidebar px-4 xl:hidden">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setIsSheetOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            )}
            {!isDashboardRoot && (
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => router.back()}
                aria-label="Go back"
              >
                <ArrowLeft className="size-5" />
              </Button>
            )}
            <h1 className="text-lg font-bold flex-1">Typenote</h1>
            {!isDashboardRoot && (
              <a
                href="/dashboard"
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-accent transition-colors text-muted-foreground"
                aria-label="Go to dashboard"
              >
                <Home className="size-5" />
              </a>
            )}
          </header>
        )}

        {/* Mobile: Sheet overlay sidebar */}
        {isMobile && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent
              side="left"
              className="w-[280px] p-0"
              showCloseButton={false}
            >
              <VisuallyHidden.Root>
                <SheetTitle>Navigation</SheetTitle>
              </VisuallyHidden.Root>
              <div className="flex h-full flex-col">{sidebar}</div>
            </SheetContent>
          </Sheet>
        )}

        {/* Desktop: inline sidebar */}
        {!isMobile && (
          <aside
            data-testid="dashboard-sidebar"
            className={`flex shrink-0 flex-col border-r border-border/30 bg-sidebar transition-[width] duration-200 overflow-hidden ${
              isOpen ? 'w-[250px]' : 'w-0 border-r-0'
            }`}
          >
            <div className="w-[250px] flex flex-col h-full">{sidebar}</div>
          </aside>
        )}

        {/* Desktop: floating reopen button when the sidebar is collapsed.
            Without this, a user who collapsed the sidebar (state persisted in
            localStorage) has no way to bring it back from dashboard or course
            pages — only the canvas editor exposes its own toggle. */}
        {!isMobile && !isOpen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Open sidebar"
            className="fixed left-3 top-3 z-50 size-9 border border-border/40 bg-sidebar/95 shadow-sm backdrop-blur-sm hover:bg-primary/10 hover:text-primary"
          >
            <Menu className="size-5" />
          </Button>
        )}

        {/* Main content — overflow-hidden only on document pages where the canvas controls its own scroll */}
        <main
          className={`flex flex-col flex-1 min-h-0 min-w-0 ${
            isDocumentPage ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          {isDocumentPage && <TabBar />}
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
