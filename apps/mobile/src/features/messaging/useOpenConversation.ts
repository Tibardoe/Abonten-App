import { api } from "@/lib/api";
import type { OpenConversationInput } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { messagingKeys } from "./keys";

// "Message the organizer" / "Message this place" / "Contact support".
// open_conversation is a deterministic get-or-create — tapping the button
// twice always resolves to the same thread — so this mutation is safe to
// fire on every press. On success it navigates into the chat screen.
export function useOpenConversation() {
  const router = useRouter();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: OpenConversationInput) => api.messaging.open(input),
    onSuccess: (res) => {
      if (res.status === 200 && res.data?.conversationId) {
        qc.invalidateQueries({ queryKey: messagingKeys.lists() });
        router.push(`/(app)/messages/${res.data.conversationId}`);
      }
    },
  });
}
