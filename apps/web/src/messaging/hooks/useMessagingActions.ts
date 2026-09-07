"use client";

import { blockConversationParticipant } from "@/actions/blockConversationParticipant";
import { deleteMessage } from "@/actions/deleteMessage";
import { editMessage } from "@/actions/editMessage";
import { markConversationRead } from "@/actions/markConversationRead";
import { setConversationState } from "@/actions/setConversationState";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Thin wrappers over the messaging Server Actions. Every write is
// server-authorised in the RPC (author-only edit/delete, 15-minute edit
// window, bidirectional block enforced inside send_message); these just fire
// and re-sync the affected React Query keys.

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; content: string }) =>
      editMessage(input),
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
    mutationFn: (messageId: string) => deleteMessage({ messageId }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
    },
  });
}

// Advance the caller's read position. Called on mount and whenever a new
// message lands while the thread is on screen. Idempotent; the RPC clamps
// `upTo` to now() and only ever moves the marker forward.
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; upTo?: string }) =>
      markConversationRead({
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
    mutationFn: (input: {
      conversationId: string;
      muted?: boolean;
      archived?: boolean;
    }) => setConversationState(input),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: messagingKeys.lists() });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(input.conversationId),
      });
    },
  });
}

export function useBlockParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      blockedUserId: string;
      block: boolean;
    }) => blockConversationParticipant(input),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(input.conversationId),
      });
    },
  });
}
