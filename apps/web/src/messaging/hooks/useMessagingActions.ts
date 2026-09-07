"use client";

import { blockConversationParticipant } from "@/actions/blockConversationParticipant";
import { deleteMessage } from "@/actions/deleteMessage";
import { editMessage } from "@/actions/editMessage";
import { markConversationRead } from "@/actions/markConversationRead";
import { markConversationUnread } from "@/actions/markConversationUnread";
import { setConversationState } from "@/actions/setConversationState";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adjustUnreadBadge,
  applyConversationPatch,
  applyConversationRead,
  applyConversationUnread,
  readUnreadCount,
  removeConversationRow,
  restoreLists,
  snapshotLists,
} from "./inboxCache";
import { messagingKeys } from "./keys";

// Thin wrappers over the messaging Server Actions. Every write is
// server-authorised in the RPC (author-only edit/delete, 15-minute edit
// window, bidirectional block enforced inside send_message).
//
// Read / mute / archive reconcile by *patching the affected row* rather than
// invalidating the inbox. mark_conversation_read, mark_conversation_unread and
// set_conversation_state all write to `conversation_participant` only — never
// to `conversation` — so the inbox realtime channel (which watches
// `conversation`) never fires for them and nothing else depended on that
// invalidation. Because the workspace keeps the list mounted beside the open
// thread, invalidating meant a visible full-list refetch every time a
// conversation was opened.

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; content: string }) =>
      editMessage(input),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });
      // An edit can change the inbox preview text.
      qc.invalidateQueries({
        queryKey: messagingKeys.lists(),
        refetchType: "active",
      });
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
      qc.invalidateQueries({
        queryKey: messagingKeys.lists(),
        refetchType: "active",
      });
    },
  });
}

// Advance the caller's read position. Called on mount and whenever a new
// message lands while the thread is on screen. Idempotent; the RPC clamps
// `upTo` to now() and only ever moves the marker forward. The row and the nav
// badge clear the instant the thread opens, with no list refetch.
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; upTo?: string }) =>
      markConversationRead({
        conversationId: input.conversationId,
        upTo: input.upTo ?? null,
      }),
    onMutate: (input) => {
      const snapshot = snapshotLists(qc);
      const cleared = readUnreadCount(qc, input.conversationId);
      applyConversationRead(qc, input.conversationId);
      adjustUnreadBadge(qc, -cleared);
      return { snapshot, cleared };
    },
    onError: (_err, _input, ctx) => {
      if (!ctx) return;
      restoreLists(qc, ctx.snapshot);
      adjustUnreadBadge(qc, ctx.cleared);
    },
    onSuccess: (_res, input) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(input.conversationId),
        refetchType: "active",
      });
    },
  });
}

// Rewind the caller's read cursor so a conversation reads as unread again
// (inbox row menu). Server clamps it to just before the last inbound message
// and no-ops when there's nothing inbound — which the client can't predict,
// so the list is refetched once to settle on the server's truth.
export function useMarkConversationUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      markConversationUnread({ conversationId }),
    onMutate: (conversationId) => {
      const snapshot = snapshotLists(qc);
      applyConversationUnread(qc, conversationId);
      adjustUnreadBadge(qc, 1);
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) restoreLists(qc, ctx.snapshot);
      adjustUnreadBadge(qc, -1);
    },
    onSuccess: (_res, conversationId) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.lists(),
        refetchType: "active",
      });
      qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(conversationId),
        refetchType: "active",
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
    onMutate: (input) => {
      const snapshot = snapshotLists(qc);
      if (typeof input.muted === "boolean") {
        applyConversationPatch(qc, input.conversationId, {
          muted: input.muted,
        });
      }
      // Archiving moves the row between the active and archived lists, so it
      // leaves whichever list is on screen immediately.
      if (typeof input.archived === "boolean") {
        removeConversationRow(qc, input.conversationId);
      }
      return { snapshot, movedList: typeof input.archived === "boolean" };
    },
    onError: (_err, _input, ctx) => {
      if (ctx) restoreLists(qc, ctx.snapshot);
    },
    onSuccess: (_res, input, ctx) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(input.conversationId),
        refetchType: "active",
      });
      // Only an archive changes list *membership*; a mute is fully described
      // by the patch above.
      if (ctx?.movedList) {
        qc.invalidateQueries({
          queryKey: messagingKeys.lists(),
          refetchType: "active",
        });
        qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
      }
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
