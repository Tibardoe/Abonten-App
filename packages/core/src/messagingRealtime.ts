// Shared realtime contract for in-app messaging — pure constants + payload
// shapes, no @supabase/supabase-js dependency. Both apps (web + mobile)
// build their own `supabase.channel(...)` subscription on top of this so
// the channel name, event names, and typing/presence payloads never drift
// between platforms.
//
// Two transports (see 20260907091000_messaging_realtime.sql):
//   * postgres_changes on `public.message` / `public.conversation` /
//     `public.conversation_participant` — durable events (new message,
//     edit, soft delete, last_message bump, read-receipt / mute / archive).
//     Authorized by the RLS on those tables (participant-only).
//   * Broadcast + Presence on the PRIVATE channel `conversation:<id>` —
//     ephemeral typing indicator + who's-in-the-thread presence. Authorized
//     by the RLS on `realtime.messages` (participant-only). NEVER persisted.

/** Private Realtime channel for one conversation's typing + presence. */
export function conversationChannelName(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/** Per-user private channel for cross-conversation signals (unread badge,
 *  new-conversation nudges) if a client wants one stream instead of N. */
export function userInboxChannelName(userId: string): string {
  return `inbox:${userId}`;
}

export const MESSAGING_BROADCAST_EVENTS = {
  /** Someone started/stopped typing. Payload: TypingBroadcast. */
  typing: "typing",
} as const;

export type TypingBroadcast = {
  userId: string;
  /** true = started typing, false = stopped (sent, blurred, or timed out). */
  isTyping: boolean;
  at: number; // Date.now() on the sender — receivers expire stale state
};

/** How long a "typing" state is trusted before the receiver drops it, in
 *  case the "stopped" broadcast is lost (disconnect, backgrounding). */
export const TYPING_TTL_MS = 6000;
/** Client should re-emit "typing: true" no more often than this while the
 *  composer stays active. */
export const TYPING_THROTTLE_MS = 2500;

export type ConversationPresenceState = {
  userId: string;
  /** The client marks this true only while the chat screen is foregrounded
   *  and focused — drives "seen" + push suppression. */
  activeInConversation: boolean;
  at: number;
};

/** Recency buckets for an "online / recently active / offline" presence
 *  label, derived from a last-seen timestamp (ms). Presence itself stays
 *  ephemeral; a client that also persists a coarse `last_seen_at` can reuse
 *  this to render the label. */
export function presenceRecency(
  lastSeenMs: number | null | undefined,
  nowMs: number = Date.now(),
): "online" | "recently_active" | "offline" {
  if (lastSeenMs == null) return "offline";
  const delta = nowMs - lastSeenMs;
  if (delta <= 60_000) return "online";
  if (delta <= 15 * 60_000) return "recently_active";
  return "offline";
}
