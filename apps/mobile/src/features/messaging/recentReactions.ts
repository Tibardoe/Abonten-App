import { isValidReactionEmoji } from "@abonten/core/messagingReactions";
import { MESSAGE_REACTION_EMOJIS } from "@abonten/types/messagingType";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

// Remembers emoji the user picked from the "+" picker so they surface at the
// front of the reaction bar next time, most-recent first. Same shape as
// inboxPrefs.ts: keyed by user id so accounts don't bleed into each other,
// and every storage failure degrades silently to the defaults rather than
// breaking the reaction bar.

/** How many quick slots the bar shows before the "+" button. */
export const REACTION_BAR_SLOTS = MESSAGE_REACTION_EMOJIS.length;

/** Recents are capped so the defaults are never pushed out entirely. */
const MAX_RECENTS = 4;

function storageKey(userId: string) {
  return `abonten.messaging.recent-reactions.${userId}`;
}

function sanitize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    if (!isValidReactionEmoji(v)) continue;
    if (out.includes(v)) continue;
    out.push(v);
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

/**
 * Merge remembered picks in front of the default palette, de-duplicated and
 * trimmed to the bar's slot count. A recent that is already a default just
 * moves to the front rather than appearing twice.
 */
export function reactionBarEmojis(recents: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [...recents, ...MESSAGE_REACTION_EMOJIS]) {
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= REACTION_BAR_SLOTS) break;
  }
  return out;
}

export function useRecentReactions(userId: string | undefined) {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setRecents([]);
      return;
    }
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(storageKey(userId));
        if (cancelled || !raw) return;
        setRecents(sanitize(JSON.parse(raw)));
      } catch {
        // keep the defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const remember = useCallback(
    (emoji: string) => {
      if (!isValidReactionEmoji(emoji)) return;
      setRecents((prev) => {
        const next = sanitize([emoji, ...prev]);
        if (userId) {
          SecureStore.setItemAsync(storageKey(userId), JSON.stringify(next))
            // A write failure only costs the user their ordering next launch.
            .catch(() => {});
        }
        return next;
      });
    },
    [userId],
  );

  return { recents, emojis: reactionBarEmojis(recents), remember };
}
