'use client';

import { useEffect, useState } from 'react';

/**
 * Persistent state backed by localStorage.
 * Renders with `initial` on the server, then hydrates from localStorage
 * after mount (avoids SSR hydration mismatches).
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        // Legitimate post-mount hydration from localStorage (SSR rendered `initial`)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // corrupted storage — fall back to initial
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked — ignore
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}
