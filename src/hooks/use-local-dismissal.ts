'use client';

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'typenote:latex-onboarding-dismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useLocalDismissal(): [boolean, () => void] {
  const [isDismissed, setIsDismissed] = useState<boolean>(readDismissed);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded)
    }
    setIsDismissed(true);
  }, []);

  return [isDismissed, dismiss];
}
