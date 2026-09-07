import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { messagingKeys } from "./keys";

// Keeps the inbox list + the tab badge live. postgres_changes on
// public.conversation (non-private channel — authorized by the table's own
// participant-or-staff RLS, so only the user's own conversations are
// delivered): a last_message_* bump or a new conversation invalidates the
// list and the unread count. Mounted by the Messages list screen and by the
// tab badge host so the badge updates even when the list isn't open.
export function useInboxRealtime() {
  const qc = useQueryClient();
  const { session } = useSession();
  const myId = session?.user.id;

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
    };

    const channel = supabase
      .channel(`inbox:${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation" },
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
      cancelled = true;
      void cancelled;
      supabase.removeChannel(channel);
    };
  }, [myId, qc]);
}
