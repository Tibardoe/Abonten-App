"use client";

import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type ReactionRealtimePayload,
  reactionRealtimePatches,
} from "@abonten/core/messagingReactions";
import {
  MESSAGING_BROADCAST_EVENTS,
  type MessageInsertBroadcast,
  TYPING_THROTTLE_MS,
  TYPING_TTL_MS,
  type TypingBroadcast,
  channelNeedsRejoin,
  conversationChannelName,
  openPrivateChannel,
} from "@abonten/core/messagingRealtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyReactionToCache } from "./cache";
import { messagingKeys } from "./keys";

type Options = { onIncomingMessage?: () => void };

// Realtime for one open thread: ONE private channel, `conversation:<id>`,
// authorised by the participant-only RLS on realtime.messages (see
// @abonten/core/messagingRealtime). It carries the client-sent "typing"
// broadcast and the change events database triggers send when a write
// commits (20260918120100). Postgres stays the source of truth: a message
// event carries ids only and triggers a refetch through RLS. The inbox row is
// not patched here — MessagingWorkspace's `inbox:<me>` channel already gets
// the conversation's last-message bump. This hook is the only owner of the
// `conversation:<id>` topic on web. When the tab becomes visible again or the
// session token is refreshed, a channel that is not joined is opened again
// (a join the server refused is not retried by realtime-js).
export function useConversationRealtime(
  conversationId: string | undefined,
  { onIncomingMessage }: Options = {},
) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const myId = user?.id;

  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  // Bumped to tear the channel down and open a fresh one.
  const [generation, setGeneration] = useState(0);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const lastTypingSentAt = useRef(0);
  const wasConnected = useRef(false);
  const onIncomingRef = useRef(onIncomingMessage);
  onIncomingRef.current = onIncomingMessage;

  const dropTyping = useCallback((userId: string) => {
    const t = typingTimers.current.get(userId);
    if (t) clearTimeout(t);
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

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;

      const channel = await openPrivateChannel(
        supabase,
        conversationChannelName(conversationId),
        () => cancelled,
      );
      if (!channel) return;
      broadcastChannelRef.current = channel;

      channel
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
            qc.invalidateQueries({
              queryKey: messagingKeys.detail(conversationId),
            });
          },
        )
        .on(
          "broadcast",
          { event: MESSAGING_BROADCAST_EVENTS.reaction },
          ({ payload }) => {
            // Patch the affected message in place; the shared reducer
            // suppresses our own echo and ignores malformed payloads.
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
          if (cancelled || status !== "SUBSCRIBED") return;
          // A rejoin (or a fresh generation) may have missed events.
          if (wasConnected.current || generation > 0) refetchThread();
          wasConnected.current = true;
        });
    })();

    const rejoinIfDown = () => {
      const ch = broadcastChannelRef.current;
      if (!cancelled && ch && channelNeedsRejoin(ch.state)) {
        setGeneration((g) => g + 1);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") rejoinIfDown();
    };
    document.addEventListener("visibilitychange", onVisible);
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") rejoinIfDown();
    });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      authSub.subscription.unsubscribe();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      setTypingUserIds([]);
      wasConnected.current = false;
      const bc = broadcastChannelRef.current;
      broadcastChannelRef.current = null;
      if (bc) void supabase.removeChannel(bc);
    };
  }, [conversationId, myId, qc, dropTyping, markTyping, generation]);

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

  return { typingUserIds, sendTyping };
}
