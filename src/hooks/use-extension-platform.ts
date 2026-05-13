'use client';

import { useSyncExternalStore } from 'react';

interface ExtensionPlatform {
  isSupportedPlatform: boolean;
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const pointerFine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const chromeRuntime = (window as unknown as { chrome?: typeof chrome }).chrome
    ?.runtime;
  const hasChromeRuntime = typeof chromeRuntime?.sendMessage === 'function';
  return pointerFine && hasChromeRuntime;
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
