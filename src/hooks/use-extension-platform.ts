'use client';

import { useSyncExternalStore } from 'react';

interface ExtensionPlatform {
  isSupportedPlatform: boolean;
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const pointerFine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const chromeObj = (window as unknown as { chrome?: Record<string, unknown> })
    .chrome;
  // `chrome.runtime` only appears once the extension is installed AND the page
  // is in its `externally_connectable.matches`, so we can't gate on it — that
  // would make the install card itself unreachable. Instead detect the Chromium
  // family via the stable Chrome-only globals (`loadTimes`/`csi`/`app`) that
  // exist on every Chromium-based browser without any extension installed.
  const isChromiumFamily =
    !!chromeObj &&
    ('loadTimes' in chromeObj || 'csi' in chromeObj || 'app' in chromeObj);
  return pointerFine && isChromiumFamily;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia('(pointer: fine)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * Returns whether the current device can host the Typenote Moodle extension.
 * True only on Chromium-family desktop browsers with a fine pointer (mouse/trackpad).
 * SSR-safe: returns false on the server, hydrates to the real value on the client.
 */
export function useExtensionPlatform(): ExtensionPlatform {
  const isSupportedPlatform = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );
  return { isSupportedPlatform };
}
