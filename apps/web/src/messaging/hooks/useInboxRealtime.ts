"use client";

import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { messagingKeys } from "./keys";

// Keeps the inbox list + the nav badge live. postgres_changes on
// public.conversation (non-private channel — authorized by the table's own
// participant-or-staff RLS, so only the user's own conversations are
// delivered): a last_message_* bump or a new conversation invalidates the
// list and the unread count.
export function useInboxRealtime() {
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
      supabase.removeChannel(channel);
    };
  }, [myId, qc]);
}
