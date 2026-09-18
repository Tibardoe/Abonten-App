"use client";

import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type InboxConversationBroadcast,
  MESSAGING_INBOX_EVENTS,
  openPrivateChannel,
  userInboxChannelName,
} from "@abonten/core/messagingRealtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { adjustUnreadBadge, bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";

// Keeps the inbox list + the nav badge live, on the signed-in user's private
// `inbox:<id>` channel. Only that user can join it (RLS on
// realtime.messages); database triggers publish to it when one of their
// conversations changes (20260918120100). MessagingWorkspace is the one owner
// of that topic on web.
//
// A conversation_update carries the new last-message fields, so the cached
// row is patched and re-seated at the top — the same result a refetch would
// produce, without the round trip. Invalidation is the fallback for what the
// client can't synthesise: a conversation not in the cached list, one added
// or removed, and the user's own read / mute / archive state changing in
// another tab or device.
//
// `activeId` is the conversation open in the thread pane; a message arriving
// there is marked read immediately, so it must not raise the badge. It is read
// through a ref so switching threads does not tear the channel down.
export function useInboxRealtime(activeId?: string) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const myId = user?.id;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let joinedBefore = false;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
    };

    const onConversationUpdate = ({ payload }: { payload: unknown }) => {
      const row = payload as InboxConversationBroadcast | undefined;
      if (!row?.id) return invalidate();

      const inbound =
        !!row.last_message_sender_id &&
        row.last_message_sender_id !== myId &&
        row.id !== activeRef.current;
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
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;
      channel = await openPrivateChannel(
        supabase,
        userInboxChannelName(myId),
        () => cancelled,
      );
      if (!channel) return;
      channel
        .on(
          "broadcast",
          { event: MESSAGING_INBOX_EVENTS.conversationUpdate },
          onConversationUpdate,
        )
        .on(
          "broadcast",
          { event: MESSAGING_INBOX_EVENTS.conversationAdded },
          invalidate,
        )
        .on(
          "broadcast",
          { event: MESSAGING_INBOX_EVENTS.conversationRemoved },
          invalidate,
        )
        .on(
          "broadcast",
          { event: MESSAGING_INBOX_EVENTS.conversationState },
          invalidate,
        )
        .subscribe((status) => {
          if (cancelled || status !== "SUBSCRIBED") return;
          // A rejoin after a dropped socket may have missed events.
          if (joinedBefore) invalidate();
          joinedBefore = true;
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [myId, qc]);
}
