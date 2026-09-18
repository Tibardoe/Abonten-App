import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  type ReactionRealtimePayload,
  reactionRealtimePatches,
} from "@abonten/core/messagingReactions";
import {
  type ConversationPresenceState,
  MESSAGING_BROADCAST_EVENTS,
  type MessageInsertBroadcast,
  TYPING_THROTTLE_MS,
  TYPING_TTL_MS,
  type TypingBroadcast,
  conversationChannelName,
  openPrivateChannel,
} from "@abonten/core/messagingRealtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { applyReactionToCache } from "./cache";
import { messagingKeys } from "./keys";

type Options = {
  // Fired when a message from someone else lands (drives "mark read while
  // focused" + auto-scroll).
  onIncomingMessage?: () => void;
};

// The realtime layer for one open thread: ONE private channel,
// `conversation:<id>`, authorised by the participant-only RLS on
// realtime.messages (see @abonten/core/messagingRealtime).
//
//   * typing   — broadcast by clients, ephemeral.
//   * presence — who has THIS thread open right now, ephemeral.
//   * message_insert / message_update / reaction / participant_update —
//     broadcast by database triggers when a write commits
//     (20260918120100_messaging_realtime_broadcast_from_database).
//
// Postgres is the source of truth: a message event carries ids only and
// triggers a refetch through RLS. The inbox row is NOT patched here — the
// `inbox:<me>` channel (useInboxRealtime, mounted by the app stack host) already
// receives the conversation's last-message bump for every thread, open or
// not. supabase-js reconnects the socket and rejoins on its own; each fresh
// SUBSCRIBED after the first refetches the thread to close the gap.
//
// This hook is the ONLY owner of the `conversation:<id>` topic in the app
// (openPrivateChannel's contract).
export function useConversationRealtime(
  conversationId: string | undefined,
  { onIncomingMessage }: Options = {},
) {
  const qc = useQueryClient();
  const { session } = useSession();
  const myId = session?.user.id;

  const [connected, setConnected] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  // Who else has THIS thread open right now (Realtime Presence — ephemeral,
  // never stored). It means "in this chat", not "online in the app", and the
  // UI says exactly that.
  const [presentUserIds, setPresentUserIds] = useState<string[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const lastTypingSentAt = useRef(0);
  const wasConnected = useRef(false);
  const onIncomingRef = useRef(onIncomingMessage);
  onIncomingRef.current = onIncomingMessage;

  const dropTyping = useCallback((userId: string) => {
    const timer = typingTimers.current.get(userId);
    if (timer) clearTimeout(timer);
    typingTimers.current.delete(userId);
    setTypingUserIds((prev) => prev.filter((id) => id !== userId));
  }, []);

  const markTyping = useCallback(
    (userId: string) => {
      const existing = typingTimers.current.get(userId);
      if (existing) clearTimeout(existing);
      typingTimers.current.set(
        userId,
        setTimeout(() => dropTyping(userId), TYPING_TTL_MS),
      );
      setTypingUserIds((prev) =>
        prev.includes(userId) ? prev : [...prev, userId],
      );
    },
    [dropTyping],
  );

  useEffect(() => {
    if (!conversationId || !myId) return;
    let cancelled = false;
    const timers = typingTimers.current;

    const refetchThread = () =>
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });

    // Only claim to be "in this chat" while the app is actually in front.
    const trackPresence = async (active: boolean) => {
      const ch = channelRef.current;
      if (!ch || !myId) return;
      try {
        if (active) {
          await ch.track({
            userId: myId,
            activeInConversation: true,
            at: Date.now(),
          } satisfies ConversationPresenceState);
        } else {
          await ch.untrack();
        }
      } catch {
        // Presence is a nicety; a failed track never affects messaging.
      }
    };

    // The socket authorises a private join with the JWT it holds; push the
    // current one so a token refreshed mid-session is what RLS sees.
    const pushAuth = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
    };

    (async () => {
      await pushAuth();
      if (cancelled) return;
      const channel = await openPrivateChannel(
        supabase,
        conversationChannelName(conversationId),
        () => cancelled,
      );
      if (!channel) return;
      channelRef.current = channel;

      const readPresence = () => {
        const state = channel.presenceState<ConversationPresenceState>();
        const ids = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const p of entries) {
            if (p.userId && p.userId !== myId && p.activeInConversation) {
              ids.add(p.userId);
            }
          }
        }
        const next = [...ids].sort();
        setPresentUserIds((prev) =>
          prev.length === next.length && prev.every((v, i) => v === next[i])
            ? prev
            : next,
        );
      };

      channel
        .on("presence", { event: "sync" }, readPresence)
        .on(
          "broadcast",
          { event: MESSAGING_BROADCAST_EVENTS.typing },
          ({ payload }) => {
            const p = payload as TypingBroadcast | undefined;
            if (!p?.userId || p.userId === myId) return;
            if (p.isTyping) markTyping(p.userId);
            else dropTyping(p.userId);
          },
        )
        .on(
          "broadcast",
          { event: MESSAGING_BROADCAST_EVENTS.messageInsert },
          ({ payload }) => {
            const row = payload as MessageInsertBroadcast | undefined;
            refetchThread();
            if (row?.sender_id) dropTyping(row.sender_id);
            if (
              row?.sender_id &&
              row.sender_id !== myId &&
              row.message_type !== "system"
            ) {
              onIncomingRef.current?.();
            }
          },
        )
        .on(
          "broadcast",
          { event: MESSAGING_BROADCAST_EVENTS.messageUpdate },
          refetchThread,
        )
        .on(
          "broadcast",
          { event: MESSAGING_BROADCAST_EVENTS.participantUpdate },
          () => {
            // The other participant's last_read_at moved (or they left) —
            // refresh the context so our outgoing "Seen" marker updates.
            qc.invalidateQueries({
              queryKey: messagingKeys.detail(conversationId),
            });
          },
        )
        .on(
          "broadcast",
          { event: MESSAGING_BROADCAST_EVENTS.reaction },
          ({ payload }) => {
            // Patch the affected message in place rather than refetching
            // every loaded page of the thread. The reducer is shared +
            // unit-tested in @abonten/core/messagingReactions: it suppresses
            // our own echo and ignores malformed payloads.
            for (const p of reactionRealtimePatches(
              payload as ReactionRealtimePayload,
              myId,
            )) {
              applyReactionToCache(
                qc,
                conversationId,
                p.messageId,
                p.emoji,
                p.added,
                false,
              );
            }
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          const isUp = status === "SUBSCRIBED";
          setConnected(isUp);
          if (!isUp) return;
          if (wasConnected.current) refetchThread();
          wasConnected.current = true;
          if (AppState.currentState === "active") void trackPresence(true);
        });
    })();

    // Foreground the app after a spell in the background: the socket may
    // have missed events while suspended. Re-push the (possibly refreshed)
    // token and reconcile — the same close-the-gap step as a rejoin.
    const appStateSub = AppState.addEventListener("change", (next) => {
      void trackPresence(next === "active");
      if (next === "active") {
        void pushAuth().then(() => {
          if (!cancelled) refetchThread();
        });
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      setTypingUserIds([]);
      setPresentUserIds([]);
      setConnected(false);
      wasConnected.current = false;
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [conversationId, myId, qc, dropTyping, markTyping]);

  // Throttled "I'm typing" broadcast. `isTyping: false` (sent, blurred) is
  // always sent immediately so the other side clears without waiting for TTL.
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const ch = channelRef.current;
      if (!ch || !myId) return;
      const now = Date.now();
      if (isTyping && now - lastTypingSentAt.current < TYPING_THROTTLE_MS)
        return;
      lastTypingSentAt.current = isTyping ? now : 0;
      void ch.send({
        type: "broadcast",
        event: MESSAGING_BROADCAST_EVENTS.typing,
        payload: { userId: myId, isTyping, at: now } satisfies TypingBroadcast,
      });
    },
    [myId],
  );

  return { connected, typingUserIds, presentUserIds, sendTyping };
}
