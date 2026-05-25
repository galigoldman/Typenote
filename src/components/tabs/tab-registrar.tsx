'use client';

import { useEffect } from 'react';
import { useTabs } from '@/contexts/tabs-context';

interface TabRegistrarProps {
  documentId: string;
  title: string;
}

/**
 * Invisible client component that registers the current document as a tab.
 * Rendered by the document page (server component) to ensure every visited
 * document appears in the tab bar.
 */
export function TabRegistrar({ documentId, title }: TabRegistrarProps) {
  const { registerTab, updateTabTitle } = useTabs();

  useEffect(() => {
    registerTab(documentId, title);
  }, [documentId, title, registerTab]);

  // Keep tab title in sync if document is renamed
  useEffect(() => {
    updateTabTitle(documentId, title);
  }, [documentId, title, updateTabTitle]);

  return null;
}
