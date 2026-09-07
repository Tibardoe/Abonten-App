import { api } from "@/lib/api";
import type {
  BlockParticipantBody,
  EditMessageBody,
  SetConversationStateBody,
} from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Thin wrappers over the messaging API. Every write is server-authorised in
// the RPC (author-only edit/delete, 15-minute edit window, bidirectional
// block enforced inside send_message); these just fire and re-sync the
// affected React Query keys.

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EditMessageBody) => api.messaging.edit(body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
    },
  });
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.messaging.remove({ messageId }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
    },
  });
}

// Advance the caller's read position. Called on screen focus and whenever a
// new message lands while the thread is foregrounded. Idempotent and cheap;
// the RPC clamps `upTo` to now() and only ever moves the marker forward.
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; upTo?: string }) =>
      api.messaging.markRead({
        conversationId: input.conversationId,
        upTo: input.upTo ?? null,
      }),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(input.conversationId),
      });
    },
  });
}

export function useSetConversationState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetConversationStateBody) =>
      api.messaging.setState(body),
    onSuccess: (_res, body) => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(body.conversationId),
      });
    },
  });
}

// Rewind the caller's read cursor so the row reads as unread again (swipe
// action / row menu). Server clamps it to just before the last inbound
// message, and no-ops when there's nothing inbound.
export function useMarkConversationUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.messaging.markUnread({ conversationId }),
    onSuccess: (_res, conversationId) => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(conversationId),
      });
    },
  });
}

export function useBlockParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BlockParticipantBody) => api.messaging.block(body),
    onSuccess: (_res, body) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(body.conversationId),
      });
    },
  });
}
