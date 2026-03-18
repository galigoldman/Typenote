'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'typenote:split-view-enabled';

export function useSplitViewPreference() {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setEnabledState(stored === 'true');
    }
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  return { splitViewEnabled: enabled, setSplitViewEnabled: setEnabled };
}
