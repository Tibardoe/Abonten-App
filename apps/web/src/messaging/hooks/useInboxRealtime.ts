"use client";

import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type InboxConversationBroadcast,
  MESSAGING_INBOX_EVENTS,
  channelNeedsRejoin,
  inboxUpdateEffect,
  openPrivateChannel,
  userInboxChannelName,
} from "@abonten/core/messagingRealtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
//
// Staying connected: realtime-js rejoins after a network drop by itself, but a
// join the server refuses (a stale token after the tab slept) is final. When
// the tab becomes visible again or the session token is refreshed, a channel
// that is not joined is opened again with the current token.
export function useInboxRealtime(activeId?: string) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const myId = user?.id;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  // Bumped to tear the channel down and open a fresh one.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let joinedBefore = false;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
    };

    const rejoinIfDown = () => {
      if (!cancelled && channel && channelNeedsRejoin(channel.state)) {
        setGeneration((g) => g + 1);
      }
    };

    const onConversationUpdate = ({ payload }: { payload: unknown }) => {
      const row = payload as InboxConversationBroadcast | undefined;
      if (!row?.id) return invalidate();

      // Shared rule: a rollback (deleted latest message) is never unread and
      // asks for a refetch; see @abonten/core/messagingRealtime.
      const { unreadDelta, reconcile } = inboxUpdateEffect(
        row,
        myId,
        activeRef.current,
      );
      const patched = bumpConversationRow(
        qc,
        row.id,
        {
          last_message_at: row.last_message_at ?? null,
          last_message_preview: row.last_message_preview ?? null,
          last_message_sender_id: row.last_message_sender_id ?? null,
        },
        unreadDelta,
      );

      if (!patched || reconcile) return invalidate();
      if (unreadDelta) adjustUnreadBadge(qc, unreadDelta);
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
          // A rejoin (or a fresh generation) may have missed events.
          if (joinedBefore || generation > 0) invalidate();
          joinedBefore = true;
        });
    })();

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
      if (channel) void supabase.removeChannel(channel);
    };
  }, [myId, qc, generation]);
}
