"use client";

import { openConversation } from "@/actions/openConversation";
import type { OpenConversationInput } from "@abonten/types/messagingType";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { messagingKeys } from "./keys";

// "Message the organizer" / "Message this place" / "Contact support".
// openConversation is a deterministic get-or-create — clicking twice always
// resolves to the same thread — so this is safe to fire on every click. On
// success it navigates into the conversation.
export function useOpenConversation() {
  const router = useRouter();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: OpenConversationInput) => openConversation(input),
    onSuccess: (res) => {
      if (res.status === 200 && "data" in res && res.data?.conversationId) {
        qc.invalidateQueries({ queryKey: messagingKeys.lists() });
        router.push(`/messages/${res.data.conversationId}`);
      }
    },
  });
}
