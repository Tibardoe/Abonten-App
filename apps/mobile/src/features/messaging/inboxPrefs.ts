import type { ConversationRoleScope } from "@abonten/api-client";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

// Remembers the user's last inbox mode (All / As customer / As organizer)
// and which of the optional filter chips they've added, so re-opening
// Messages lands on the same view (spec §11). Keyed by user id, so a
// different account starts clean and there's no surprising carry-over.
// Storage failures degrade to the defaults — same defensive shape as
// features/search/recentSearches.ts.

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

export const CUSTOM_FILTER_ICON: Record<CustomFilterKey, string> = {
  unread: "ellipse",
  events: "calendar-outline",
  places: "storefront-outline",
  muted: "notifications-off-outline",
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPrefs(DEFAULTS);
      setReady(false);
      return;
    }
    let active = true;
    setReady(false);
    (async () => {
      let next = DEFAULTS;
      try {
        const raw = await SecureStore.getItemAsync(storageKey(userId));
        if (raw) next = sanitize(JSON.parse(raw));
      } catch {
        // storage unavailable — fall back to defaults
      }
      if (!active) return;
      setPrefs(next);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const write = useCallback(
    (next: InboxPrefs) => {
      if (!userId) return;
      SecureStore.setItemAsync(storageKey(userId), JSON.stringify(next)).catch(
        () => {
          // ignore write failure
        },
      );
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
    ready,
    roleScope: prefs.roleScope,
    customFilters: prefs.customFilters,
    setRoleScope,
    toggleCustomFilter,
  };
}
