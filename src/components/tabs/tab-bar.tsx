'use client';

import { useTabs } from '@/contexts/tabs-context';
import { TabItem } from '@/components/tabs/tab-item';

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab } = useTabs();

  if (tabs.length === 0) return null;

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-0 overflow-x-auto border-b border-border/40 bg-sidebar/50 px-1"
      role="tablist"
      aria-label="Open documents"
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.documentId}
          documentId={tab.documentId}
          title={tab.title}
          isActive={tab.documentId === activeTabId}
          onSwitch={switchTab}
          onClose={closeTab}
        />
      ))}
    </div>
  );
}
