"use client";

import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { adjustUnreadBadge, bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";

type ConversationRow = {
  id?: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_sender_id?: string | null;
};

// Keeps the inbox list + the nav badge live. postgres_changes on
// public.conversation (non-private channel — authorized by the table's own
// participant-or-staff RLS, so only the user's own conversations are
// delivered).
//
// An UPDATE carries the whole new row, so a last_message_* bump is applied
// straight to the cached rows and re-seated at the top — the same result a
// refetch would produce, without the round-trip. Previously every bump
// (including the user's own outgoing message) invalidated every cached inbox
// view. Invalidation is now the fallback for the cases the client genuinely
// can't synthesise: a conversation not in the cached list, and a new one.
//
// `activeId` is the conversation currently open in the thread pane; a message
// arriving there is marked read immediately, so it must not raise the badge.
export function useInboxRealtime(activeId?: string) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const myId = user?.id;

  useEffect(() => {
    if (!myId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
    };

    const channel = supabase
      .channel(`inbox:${myId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation" },
        (payload) => {
          const row = payload.new as ConversationRow | undefined;
          if (!row?.id) return invalidate();

          const inbound =
            !!row.last_message_sender_id &&
            row.last_message_sender_id !== myId &&
            row.id !== activeId;
          const delta = inbound ? 1 : 0;

          const patched = bumpConversationRow(
            qc,
            row.id,
            {
              last_message_at: row.last_message_at ?? null,
              last_message_preview: row.last_message_preview ?? null,
              last_message_sender_id: row.last_message_sender_id ?? null,
            },
            delta,
          );

          if (!patched) return invalidate();
          if (delta) adjustUnreadBadge(qc, delta);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "conversation" },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participant",
          filter: `user_id=eq.${myId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, qc, activeId]);
}
