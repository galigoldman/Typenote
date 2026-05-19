'use client';

import type { ReactNode } from 'react';
import { useExtensionPlatform } from '@/hooks/use-extension-platform';

interface ExtensionGateProps {
  children: ReactNode;
}

/**
 * Renders `children` only on Chromium-family desktop browsers.
 * Silent — no fallback UI on touch/non-Chromium devices.
 *
 * @see useExtensionPlatform for the detection logic.
 */
export function ExtensionGate({ children }: ExtensionGateProps) {
  const { isSupportedPlatform } = useExtensionPlatform();
  if (!isSupportedPlatform) return null;
  return <>{children}</>;
}
