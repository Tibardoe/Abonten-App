import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { conversationPreviewFor } from "@abonten/core/messagingInboxCache";
import {
  MESSAGING_BROADCAST_EVENTS,
  TYPING_THROTTLE_MS,
  TYPING_TTL_MS,
  type TypingBroadcast,
  conversationChannelName,
} from "@abonten/core/messagingRealtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";

type Options = {
  // Fired when a message from someone else lands (drives "mark read while
  // focused" + auto-scroll).
  onIncomingMessage?: () => void;
};

// The realtime layer for one open thread. Two channels, because the two
// transports have different authorization models (see
// 20260907091000_messaging_realtime.sql):
//
//   * `conversation:<id>` — PRIVATE. Broadcast ("typing") + presence only.
//     Gated by the realtime.messages RLS policies, which name
//     `extension in ('broadcast','presence')` — a non-participant's
//     subscribe is refused outright, so a subscription can't be used to
//     watch a thread.
//   * `msgchanges:<id>` — non-private. postgres_changes on public.message /
//     public.conversation_participant, filtered to this conversation.
//     Authorized by those tables' own participant-only RLS (a private
//     channel would additionally require a 'postgres_changes' policy on
//     realtime.messages, which by design doesn't exist).
//
// Postgres is the source of truth: an inbound row triggers an invalidate
// (not a hand-merge) because the realtime payload has no joined attachments
// or reply preview. supabase-js reconnects the socket and re-subscribes on
// its own; we refetch on each fresh SUBSCRIBED to close the gap.
export function useConversationRealtime(
  conversationId: string | undefined,
  { onIncomingMessage }: Options = {},
) {
  const qc = useQueryClient();
  const { session } = useSession();
  const myId = session?.user.id;

  const [connected, setConnected] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const changesChannelRef = useRef<RealtimeChannel | null>(null);
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

    // The INSERT payload carries the whole message, so the conversation's
    // inbox row can be bumped from it directly rather than refetching every
    // cached inbox view. The thread is on screen here, so it is marked read
    // immediately and the unread count never moves. Invalidation stays as
    // the fallback for a conversation not present in any cached list.
    const bump = (row?: {
      content?: string | null;
      message_type?: string | null;
      created_at?: string | null;
      sender_id?: string | null;
    }) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });
      if (row?.created_at) {
        const patched = bumpConversationRow(qc, conversationId, {
          last_message_at: row.created_at,
          last_message_preview: conversationPreviewFor(row),
          last_message_sender_id: row.sender_id ?? null,
        });
        if (patched) return;
      }
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
    };

    // Tear down any channel left over from a previous mount of THIS
    // conversation before opening a new one — a fast back/forward
    // (unmount + remount) could otherwise run cleanup before the async
    // subscribe below had assigned the ref, leaking the old socket and
    // ending up with two `msgchanges:<id>` subscriptions delivering every
    // INSERT twice.
    const changesTopic = `msgchanges:${conversationId}`;
    const broadcastTopic = conversationChannelName(conversationId);
    for (const ch of supabase.getChannels()) {
      const t = ch.topic.replace(/^realtime:/, "");
      if (t === changesTopic || t === broadcastTopic) {
        void supabase.removeChannel(ch);
      }
    }

    // --- durable changes (non-private) --------------------------------
    // supabase.channel() / .on() are synchronous; only setAuth + subscribe
    // are async. Build + ref both channels up front so cleanup always has
    // something concrete to remove.
    const changesChannel = supabase.channel(changesTopic);
    changesChannelRef.current = changesChannel;

    const pushAuthAndRefresh = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
    };

    (async () => {
      // The RN client has a persisted session, but push the current access
      // token into the socket explicitly so a token refreshed mid-session is
      // used for the private channel's RLS check.
      await pushAuthAndRefresh();
      if (cancelled) return;

      changesChannel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const row = payload.new as {
              sender_id: string | null;
              message_type: string;
              content?: string | null;
              created_at?: string | null;
            };
            bump(row);
            if (row.sender_id) dropTyping(row.sender_id);
            if (
              row.sender_id &&
              row.sender_id !== myId &&
              row.message_type !== "system"
            ) {
              onIncomingRef.current?.();
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "message",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => {
            qc.invalidateQueries({
              queryKey: messagingKeys.messages(conversationId),
            });
            qc.invalidateQueries({ queryKey: messagingKeys.lists() });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversation_participant",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => {
            // The other participant's last_read_at moved — refresh the
            // context so our outgoing "Seen" marker updates.
            qc.invalidateQueries({
              queryKey: messagingKeys.detail(conversationId),
            });
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          const isUp = status === "SUBSCRIBED";
          setConnected(isUp);
          if (isUp) {
            if (wasConnected.current) bump();
            wasConnected.current = true;
          }
        });

      // --- typing / presence (private) ---------------------------------
      const broadcastChannel = supabase.channel(broadcastTopic, {
        config: { private: true, broadcast: { self: false } },
      });
      broadcastChannelRef.current = broadcastChannel;
      broadcastChannel.on(
        "broadcast",
        { event: MESSAGING_BROADCAST_EVENTS.typing },
        ({ payload }) => {
          const p = payload as TypingBroadcast | undefined;
          if (!p?.userId || p.userId === myId) return;
          if (p.isTyping) markTyping(p.userId);
          else dropTyping(p.userId);
        },
      );
      broadcastChannel.subscribe();
    })();

    // Foreground the app after a spell in the background: the socket may
    // have dropped rows while suspended. Re-push the (possibly refreshed)
    // token and force a reconcile — the same close-the-gap step the
    // `wasConnected` reconnect path does.
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void pushAuthAndRefresh().then(() => {
          if (!cancelled) bump();
        });
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      setTypingUserIds([]);
      setConnected(false);
      wasConnected.current = false;
      const bc = broadcastChannelRef.current;
      const cc = changesChannelRef.current;
      broadcastChannelRef.current = null;
      changesChannelRef.current = null;
      if (bc) void supabase.removeChannel(bc);
      if (cc) void supabase.removeChannel(cc);
    };
  }, [conversationId, myId, qc, dropTyping, markTyping]);

  // Throttled "I'm typing" broadcast. `isTyping: false` (sent, blurred) is
  // always sent immediately so the other side clears without waiting for TTL.
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const ch = broadcastChannelRef.current;
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

  return { connected, typingUserIds, sendTyping };
}
