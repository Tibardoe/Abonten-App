import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
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
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getActiveConversation } from "./activeConversation";
import { adjustUnreadBadge, bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";

// Keeps the inbox list + the tab badge live, on the signed-in user's private
// `inbox:<id>` channel. Only that user can join it (RLS on
// realtime.messages); database triggers publish to it when one of their
// conversations changes (20260918120100). Mounted ONCE, by the app stack host
// (app/(app)/_layout.tsx) — this hook is the only owner of that topic.
//
// A conversation_update carries the new last-message fields, so the cached
// row is patched and placed where the server's ordering puts it. Whether it
// counts as unread, and whether the inbox must also be refetched, is decided
// by the shared inboxUpdateEffect (a deletion that rolled a conversation back
// is not a new message). Invalidation covers what the client can't
// synthesise: a conversation not in the cached list, one added or removed,
// and the user's own read / mute / archive state changing on another device.
//
// Staying connected: realtime-js rejoins by itself after a network drop, but
// a join the server refuses (the token expired while the app sat in the
// background) is final. So when the app comes back to the foreground, or the
// session token is refreshed, a channel that is not joined is opened again
// with the current token.
export function useInboxRealtime() {
  const qc = useQueryClient();
  const { session } = useSession();
  const myId = session?.user.id;
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

      const { unreadDelta, reconcile } = inboxUpdateEffect(
        row,
        myId,
        getActiveConversation(),
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

    // Back from the background: events sent while suspended are gone, and
    // the channel may have been refused while the token was stale.
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || cancelled) return;
      invalidate();
      rejoinIfDown();
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") rejoinIfDown();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      authSub.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [myId, qc, generation]);
}
