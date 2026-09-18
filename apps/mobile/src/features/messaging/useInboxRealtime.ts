import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  type InboxConversationBroadcast,
  MESSAGING_INBOX_EVENTS,
  openPrivateChannel,
  userInboxChannelName,
} from "@abonten/core/messagingRealtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
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
// row is patched and re-seated at the top — the same result a refetch would
// produce, without the round trip. Invalidation is the fallback for what the
// client can't synthesise: a conversation not in the cached list, one added
// or removed, and the user's own read / mute / archive state changing on
// another device.
export function useInboxRealtime() {
  const qc = useQueryClient();
  const { session } = useSession();
  const myId = session?.user.id;

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

      // An inbound message the user isn't already reading is the only thing
      // that raises the unread count. Their own message, and one arriving in
      // the thread that's on screen (the chat screen marks it read
      // immediately), must not.
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

    // Back from the background: events sent while suspended are gone.
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active" && !cancelled) invalidate();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [myId, qc]);
}
