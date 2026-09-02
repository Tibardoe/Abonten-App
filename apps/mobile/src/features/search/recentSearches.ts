import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

// Native echo of apps/web/src/utils/recentSearches.ts — the typed search
// history behind the Search screen's empty state. Web keeps it in
// localStorage (per browser, never sent to the server); the equivalent
// here is expo-secure-store. Deliberately minimal: just the trimmed text,
// capped, newest first. Every call is wrapped so a storage failure just
// yields an empty list.

const STORAGE_KEY = "abonten.recent-searches";
const MAX_ENTRIES = 8;

async function read(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

async function write(next: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — ignore
  }
}

/**
 * Loads the recent-search list and exposes add / remove / clear mutators.
 * The list is held in state so the Search screen re-renders on change,
 * matching how the web bar drives its dropdown from a useState array.
 */
export function useRecentSearches() {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    read().then((list) => {
      if (active) setRecents(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const add = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecents((current) => {
      const next = [
        trimmed,
        ...current.filter((e) => e.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_ENTRIES);
      void write(next);
      return next;
    });
  }, []);

  const remove = useCallback((query: string) => {
    setRecents((current) => {
      const next = current.filter((e) => e !== query);
      void write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecents([]);
    void write([]);
  }, []);

  return { recents, add, remove, clear };
}
