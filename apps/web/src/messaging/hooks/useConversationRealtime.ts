"use client";

import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { conversationPreviewFor } from "@abonten/core/messagingInboxCache";
import { reactionRealtimePatches } from "@abonten/core/messagingReactions";
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
import { applyReactionToCache } from "./cache";
import { bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";

type Options = { onIncomingMessage?: () => void };

// Realtime for one open thread. Two channels, mirroring the mobile client,
// because the transports have different authorization models (see
// 20260907091000_messaging_realtime.sql):
//   * conversation:<id> — PRIVATE. Broadcast "typing" only. Gated by the
//     realtime.messages RLS policies (broadcast/presence, participant-only).
//   * msgchanges:<id> — non-private. postgres_changes on public.message /
//     public.conversation_participant, filtered to this conversation;
//     authorized by those tables' own participant-only RLS.
// Postgres stays the source of truth: an inbound row triggers an invalidate
// (the realtime payload has no joined attachments / reply preview).
export function useConversationRealtime(
  conversationId: string | undefined,
  { onIncomingMessage }: Options = {},
) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const myId = user?.id;

  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
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

    let changesChannel: RealtimeChannel | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;

      changesChannel = supabase.channel(`msgchanges:${conversationId}`);
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
            qc.invalidateQueries({
              queryKey: messagingKeys.detail(conversationId),
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "message_reaction",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            // A reaction changed. The payload carries the exact row (the table
            // is REPLICA IDENTITY FULL), so patch the affected message in
            // place rather than invalidating — invalidating refetched EVERY
            // loaded page of the thread on every reaction tap, including the
            // echo of this device's own optimistic toggle. The reducer is
            // shared + unit-tested in @abonten/core/messagingReactions: it
            // suppresses our own echo and ignores malformed payloads.
            for (const p of reactionRealtimePatches(payload, myId)) {
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
          if (status === "SUBSCRIBED") {
            if (wasConnected.current) bump();
            wasConnected.current = true;
          }
        });

      const broadcastChannel = supabase.channel(
        conversationChannelName(conversationId),
        { config: { private: true, broadcast: { self: false } } },
      );
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
      broadcastChannelRef.current = broadcastChannel;
    })();

    return () => {
      cancelled = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      setTypingUserIds([]);
      wasConnected.current = false;
      const bc = broadcastChannelRef.current;
      broadcastChannelRef.current = null;
      if (bc) supabase.removeChannel(bc);
      if (changesChannel) supabase.removeChannel(changesChannel);
    };
  }, [conversationId, myId, qc, dropTyping, markTyping]);

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
