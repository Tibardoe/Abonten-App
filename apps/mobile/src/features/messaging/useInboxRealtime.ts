import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { userInboxChannelName } from "@abonten/core/messagingRealtime";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getActiveConversation } from "./activeConversation";
import { adjustUnreadBadge, bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";
import { uniqueRealtimeTopic } from "./realtimeTopic";

type ConversationRow = {
  id?: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_sender_id?: string | null;
};

// Keeps the inbox list + the tab badge live. postgres_changes on
// public.conversation (non-private channel — authorized by the table's own
// participant-or-staff RLS, so only the user's own conversations are
// delivered). Mounted by the Messages list screen and by the tab badge host
// so the badge updates even when the list isn't open.
//
// An UPDATE carries the whole new row, so a last_message_* bump is applied
// straight to the cached rows and re-seated at the top — the same result a
// refetch would produce, without the round-trip. Previously every bump
// (including the user's own outgoing message) invalidated every cached inbox
// view, refetching all of their loaded pages. Invalidation is now the
// fallback for the two cases the client genuinely can't synthesise: a
// conversation that isn't in the cached list yet, and a brand-new one.
export function useInboxRealtime() {
  const qc = useQueryClient();
  const { session } = useSession();
  const myId = session?.user.id;

  useEffect(() => {
    if (!myId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
    };

    // Per-subscription topic: supabase.channel() hands back an existing
    // channel for a repeated topic, and removeChannel() only drops the old one
    // after an async unsubscribe — so re-running this effect could attach
    // these listeners to an already-subscribed channel, which throws and
    // red-screens the tab layout. See realtimeTopic.ts.
    const channel = supabase
      .channel(uniqueRealtimeTopic(userInboxChannelName(myId)))
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation" },
        (payload) => {
          const row = payload.new as ConversationRow | undefined;
          if (!row?.id) return invalidate();

          // An inbound message the user isn't already reading is the only
          // thing that raises the unread count. Their own message, and one
          // arriving in the thread that's on screen (the chat screen marks
          // it read immediately), must not.
          const inbound =
            !!row.last_message_sender_id &&
            row.last_message_sender_id !== myId &&
            row.id !== getActiveConversation();
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
      // A new conversation (or being added to one) can't be placed from the
      // payload alone — its position depends on rows this view may not hold.
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
  }, [myId, qc]);
}
