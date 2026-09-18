// Shared realtime contract for in-app messaging — pure constants, payload
// shapes and one transport helper, with no @supabase/supabase-js dependency.
// Both apps (web + mobile) build their subscriptions on top of this so the
// channel names, event names and payloads never drift between platforms.
//
// ONE TRANSPORT: Broadcast on PRIVATE channels, authorised by RLS on
// `realtime.messages` (20260907091000, 20260918120100).
//   * `conversation:<id>` — participant-only. Carries the ephemeral typing
//     indicator + presence (sent by clients, never persisted) AND the durable
//     change events below, sent by database triggers when a write commits.
//   * `inbox:<userId>` — readable only by that user. Carries inbox changes.
// Events carry ids, never message bodies: a client that hears "something
// changed" refetches through RLS, which is also what drops anything
// moderated away. (Until 2026-09-18 the durable half rode postgres_changes,
// which re-evaluates table RLS per subscriber per change — the scaling
// ceiling this replaced.)

/** Private Realtime channel for one conversation's typing + presence. */
export function conversationChannelName(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/** Per-user private channel for inbox changes (last-message bumps, a
 *  conversation added or removed, the user's own read / mute / archive state
 *  changing on another device). Only that user may join it. */
export function userInboxChannelName(userId: string): string {
  return `inbox:${userId}`;
}

export const MESSAGING_BROADCAST_EVENTS = {
  /** Someone started/stopped typing. Payload: TypingBroadcast. Client-sent. */
  typing: "typing",
  /** A message was sent. Payload: MessageInsertBroadcast. From the database. */
  messageInsert: "message_insert",
  /** A message was edited, deleted or moderated. Payload: MessageUpdateBroadcast. */
  messageUpdate: "message_update",
  /** A reaction was added, changed or removed. Payload: ReactionRealtimePayload
   *  (@abonten/core/messagingReactions). */
  reaction: "reaction",
  /** A participant's read position moved, or they left. Payload:
   *  ParticipantUpdateBroadcast. */
  participantUpdate: "participant_update",
} as const;

/** Events on the `inbox:<userId>` channel, all sent by the database. */
export const MESSAGING_INBOX_EVENTS = {
  /** Last-message fields or status changed. Payload: InboxConversationBroadcast. */
  conversationUpdate: "conversation_update",
  /** The user joined a conversation. Payload: { id }. */
  conversationAdded: "conversation_added",
  /** The user's participant row was removed. Payload: { id }. */
  conversationRemoved: "conversation_removed",
  /** The user's own read / mute / archive state changed. Payload: { id }. */
  conversationState: "conversation_state",
} as const;

export type MessageInsertBroadcast = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  message_type: string;
  created_at: string;
};

export type MessageUpdateBroadcast = { id: string; conversation_id: string };

export type ParticipantUpdateBroadcast = {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  left_at: string | null;
};

export type InboxConversationBroadcast = {
  id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  status: string | null;
  /** True when last_message_at moved forward, i.e. a new message. False for
   *  a deletion or restore that rolled the conversation back
   *  (20260918140000). Absent on events from before that migration. */
  advanced?: boolean;
};

/**
 * What a client does with one `conversation_update`:
 *   * unreadDelta — 1 only for a NEW message from someone else in a
 *     conversation that is not open on screen (the open thread is marked
 *     read immediately). A rollback is never a new message, even though its
 *     sender is someone else.
 *   * reconcile — refetch the inbox after patching it. A rollback can lower
 *     unread counts the client cannot work out on its own.
 * Events without `advanced` (sent before the flag existed) are treated as
 * new messages, which is what they almost always were.
 */
export function inboxUpdateEffect(
  update: Pick<
    InboxConversationBroadcast,
    "id" | "last_message_sender_id" | "advanced"
  >,
  myUserId: string,
  activeConversationId: string | null | undefined,
): { unreadDelta: 0 | 1; reconcile: boolean } {
  const advanced = update.advanced !== false;
  const inbound =
    advanced &&
    !!update.last_message_sender_id &&
    update.last_message_sender_id !== myUserId &&
    update.id !== activeConversationId;
  return { unreadDelta: inbound ? 1 : 0, reconcile: !advanced };
}

/**
 * Whether a private channel has to be opened again. realtime-js rejoins on
 * its own after a transport failure, but a join the server REFUSES -- the
 * socket's token expired while the app was in the background, for one --
 * leaves the channel errored or closed for good. Clients check this when the
 * app comes back to the foreground and when the session token is refreshed.
 */
export function channelNeedsRejoin(state: string | null | undefined): boolean {
  return state !== "joined" && state !== "joining";
}

/** The subset of a supabase-js client openPrivateChannel needs. Structural,
 *  so this package keeps no dependency on supabase-js. */
export type RealtimeClientLike<C extends { topic: string }> = {
  getChannels(): C[];
  removeChannel(channel: C): Promise<unknown>;
  channel(
    topic: string,
    opts: { config: { private: true; broadcast?: { self?: boolean } } },
  ): C;
};

/**
 * Open a fresh PRIVATE channel for `topic`.
 *
 * supabase-js returns the EXISTING channel when `channel(topic)` is called
 * for a topic still registered, and `removeChannel` is async (it waits for
 * the unsubscribe round trip). A screen that unmounts and remounts quickly
 * could therefore be handed the old, already-subscribed channel, and adding a
 * listener to it throws ("cannot add callbacks after subscribe()"). Private
 * topics cannot dodge that with a unique suffix — their authorization is the
 * RLS on the exact topic name — so instead any stale channel for the topic is
 * fully removed first.
 *
 * Contract: each private topic has exactly ONE owner in an app (the open
 * thread for `conversation:<id>`, the signed-in shell for `inbox:<id>`).
 * Returns null if `isCancelled()` turned true while waiting — the caller's
 * effect was torn down and must not subscribe.
 */
export async function openPrivateChannel<C extends { topic: string }>(
  client: RealtimeClientLike<C>,
  topic: string,
  isCancelled: () => boolean,
  broadcast: { self?: boolean } = { self: false },
): Promise<C | null> {
  const full = `realtime:${topic}`;
  const stale = client.getChannels().filter((c) => c.topic === full);
  await Promise.all(stale.map((c) => client.removeChannel(c)));
  if (isCancelled()) return null;
  return client.channel(topic, { config: { private: true, broadcast } });
}

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
