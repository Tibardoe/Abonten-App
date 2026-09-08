import type { MessageReactionSummary } from "@abonten/types/messagingType";

// Pure re-derivation of a message's per-emoji reaction rollup, shared by the
// web and mobile TanStack Query caches so an optimistic toggle, a realtime
// event, and the server's eventual truth all converge on the same shape.
//
// Two distinct callers, hence the `mine` flag:
//
//   * the local optimistic toggle  -> mine = true  (also moves the caller's
//     own vote off whatever emoji it was on, per the one-reaction-per-user
//     rule enforced by the message_reaction primary key), and
//   * a realtime event from ANOTHER participant -> mine = false, which must
//     move the count without ever claiming the reaction as the caller's.
//
// Conflating the two was the reason the realtime path had to fall back to
// invalidating (and refetching) every loaded page of the thread.
//
// An emoji SWITCH by another user arrives as a postgres UPDATE carrying both
// the old and the new emoji, so the caller applies it as remove-then-add;
// this function deliberately never guesses at a row it wasn't told about.

export function rollReaction(
  current: MessageReactionSummary[],
  emoji: string,
  added: boolean,
  mine: boolean,
): MessageReactionSummary[] {
  let next: MessageReactionSummary[];

  if (added) {
    let placed = false;
    next = current.map((r) => {
      if (r.emoji === emoji) {
        placed = true;
        // Adding an emoji the caller already holds is a no-op on the count.
        const alreadyCounted = mine && r.reacted_by_me;
        return {
          ...r,
          count: alreadyCounted ? r.count : r.count + 1,
          reacted_by_me: mine || r.reacted_by_me,
        };
      }
      // One reaction per user: the caller's own vote leaves its old emoji.
      // Another user's switch is delivered as an explicit remove instead, so
      // only the `mine` case may touch a different emoji here.
      if (mine && r.reacted_by_me) {
        return { ...r, count: r.count - 1, reacted_by_me: false };
      }
      return r;
    });
    if (!placed) next.push({ emoji, count: 1, reacted_by_me: mine });
  } else {
    next = current.map((r) => {
      if (r.emoji !== emoji) return r;
      // Removing a reaction the caller doesn't hold must not decrement on
      // their behalf — only ever drop the vote that actually went away.
      const held = mine ? r.reacted_by_me : true;
      return {
        ...r,
        count: held ? r.count - 1 : r.count,
        reacted_by_me: mine ? false : r.reacted_by_me,
      };
    });
  }

  // Most-reacted first. Ties keep their existing relative order (Array#sort
  // is stable), so pills don't reshuffle under the user as counts move —
  // and the order never depends on the device locale.
  return next.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Realtime → cache patches
// ---------------------------------------------------------------------------

/** The shape Supabase realtime delivers for a public.message_reaction row. */
export type ReactionRealtimeRow = {
  message_id?: string | null;
  user_id?: string | null;
  emoji?: string | null;
  conversation_id?: string | null;
};

export type ReactionRealtimePayload = {
  eventType?: string;
  new?: Partial<ReactionRealtimeRow> | null;
  old?: Partial<ReactionRealtimeRow> | null;
};

/** One cache edit to apply for a message. */
export type ReactionPatch = {
  messageId: string;
  emoji: string;
  added: boolean;
};

/**
 * Translate one realtime `message_reaction` event into the cache edits it
 * implies — shared by the web and mobile conversation-realtime hooks so the
 * reducer is unit-testable instead of buried in a subscription callback.
 *
 * Returns an EMPTY list (a no-op) when the event is:
 *   • this user's own change — their optimistic toggle already patched the
 *     cache and reconciled against the RPC's answer, so re-applying the echo
 *     would double-count, or
 *   • malformed / unidentifiable (no message id, no usable emoji, no actor).
 *
 * An emoji SWITCH arrives as an UPDATE carrying both the old and new emoji,
 * and becomes remove-then-add so counts stay exact.
 */
export function reactionRealtimePatches(
  payload: ReactionRealtimePayload,
  myUserId: string | null | undefined,
): ReactionPatch[] {
  const row = payload?.new ?? {};
  const prev = payload?.old ?? {};

  const messageId = row.message_id ?? prev.message_id;
  if (!messageId) return [];

  const actor = row.user_id ?? prev.user_id;
  // An unattributable event can't be reconciled safely; a self event is
  // already reflected locally.
  if (!actor || (myUserId && actor === myUserId)) return [];

  const patch = (emoji: unknown, added: boolean): ReactionPatch[] =>
    typeof emoji === "string" && emoji.length > 0
      ? [{ messageId, emoji, added }]
      : [];

  switch (payload.eventType) {
    case "INSERT":
      return patch(row.emoji, true);
    case "DELETE":
      return patch(prev.emoji, false);
    case "UPDATE": {
      if (prev.emoji === row.emoji) return patch(row.emoji, true);
      return [...patch(prev.emoji, false), ...patch(row.emoji, true)];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Reaction emoji validation
// ---------------------------------------------------------------------------

/** Longest reaction we will store: a ZWJ sequence with modifiers still fits. */
export const MESSAGE_REACTION_MAX_LENGTH = 16;

/**
 * Is this a storable reaction emoji?
 *
 * Validated by SHAPE, not by an allowlist, because the reaction bar's "+"
 * lets the user pick any emoji from the OS keyboard. The rules mirror the
 * `message_reaction_emoji_shape` CHECK and the identical guard inside
 * `toggle_message_reaction` (migration 20260908215500) -- change one, change
 * all three. Together they make it impossible to store readable text while
 * accepting every real emoji: ZWJ sequences, skin-tone modifiers, flags and
 * keycaps all qualify.
 *
 * This is deliberately not a pictographic-property test. Postgres has no
 * \p{Extended_Pictographic}, so a property-based rule could not be mirrored
 * in the database, and a guard that only exists in TypeScript is not a guard
 * at all -- the table carries an own-row RLS INSERT policy, so a client can
 * reach it directly.
 */
export function isValidReactionEmoji(value: string): boolean {
  if (value.length < 1 || value.length > MESSAGE_REACTION_MAX_LENGTH) {
    return false;
  }
  // No ASCII letter: blocks "SPAM", "http", "lol".
  if (/[A-Za-z]/.test(value)) return false;
  // No whitespace: blocks multi-token phrases.
  if (/\s/.test(value)) return false;
  // At least one code unit above Latin-1, i.e. a multi-byte character:
  // blocks "12345", "!!!!", "<3" and friends, which the two rules above
  // would otherwise allow.
  return /[^\u0000-\u00FF]/u.test(value);
}
