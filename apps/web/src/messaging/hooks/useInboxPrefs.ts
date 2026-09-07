"use client";

import type { ConversationRoleScope } from "@abonten/types/messagingType";
import { useCallback, useEffect, useState } from "react";

// Remembers the user's last inbox mode + added filter chips so re-opening
// /messages lands on the same view (spec §11). Keyed by user id — a
// different account starts clean, no surprising carry-over. localStorage,
// same as utils/recentSearches; every access is guarded.

export const CUSTOM_FILTER_KEYS = [
  "unread",
  "events",
  "places",
  "muted",
] as const;
export type CustomFilterKey = (typeof CUSTOM_FILTER_KEYS)[number];

export const CUSTOM_FILTER_LABEL: Record<CustomFilterKey, string> = {
  unread: "Unread",
  events: "Events",
  places: "Places",
  muted: "Muted",
};

export const CUSTOM_FILTER_HELP: Record<CustomFilterKey, string> = {
  unread: "Only conversations with new messages",
  events: "Conversations about events",
  places: "Conversations about places",
  muted: "Conversations you've muted",
};

type InboxPrefs = {
  roleScope: ConversationRoleScope;
  customFilters: CustomFilterKey[];
};

const DEFAULTS: InboxPrefs = { roleScope: "all", customFilters: [] };

function storageKey(userId: string) {
  return `abonten.messaging.inbox-prefs.${userId}`;
}

function sanitize(raw: unknown): InboxPrefs {
  if (!raw || typeof raw !== "object") return DEFAULTS;
  const r = raw as Record<string, unknown>;
  const roleScope: ConversationRoleScope =
    r.roleScope === "member" || r.roleScope === "business"
      ? r.roleScope
      : "all";
  const customFilters = Array.isArray(r.customFilters)
    ? (r.customFilters.filter(
        (v): v is CustomFilterKey =>
          typeof v === "string" &&
          (CUSTOM_FILTER_KEYS as readonly string[]).includes(v),
      ) as CustomFilterKey[])
    : [];
  return { roleScope, customFilters };
}

export function useInboxPrefs(userId: string | undefined) {
  const [prefs, setPrefs] = useState<InboxPrefs>(DEFAULTS);

  useEffect(() => {
    if (!userId) {
      setPrefs(DEFAULTS);
      return;
    }
    let cancelled = false;
    try {
      const raw = window.localStorage.getItem(storageKey(userId));
      const next = raw ? sanitize(JSON.parse(raw)) : DEFAULTS;
      if (!cancelled) setPrefs(next);
    } catch {
      if (!cancelled) setPrefs(DEFAULTS);
    }
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const write = useCallback(
    (next: InboxPrefs) => {
      if (!userId) return;
      try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        // storage unavailable — ignore
      }
    },
    [userId],
  );

  const setRoleScope = useCallback(
    (roleScope: ConversationRoleScope) => {
      const next = { ...prefs, roleScope };
      setPrefs(next);
      write(next);
    },
    [prefs, write],
  );

  const toggleCustomFilter = useCallback(
    (key: CustomFilterKey) => {
      const customFilters = prefs.customFilters.includes(key)
        ? prefs.customFilters.filter((k) => k !== key)
        : [...prefs.customFilters, key];
      const next = { ...prefs, customFilters };
      setPrefs(next);
      write(next);
    },
    [prefs, write],
  );

  return {
    roleScope: prefs.roleScope,
    customFilters: prefs.customFilters,
    setRoleScope,
    toggleCustomFilter,
  };
}
