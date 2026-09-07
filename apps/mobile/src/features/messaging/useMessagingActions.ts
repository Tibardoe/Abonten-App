import { api } from "@/lib/api";
import type {
  BlockParticipantBody,
  EditMessageBody,
  SetConversationStateBody,
} from "@abonten/api-client";
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

// Thin wrappers over the messaging API. Every write is server-authorised in
// the RPC (author-only edit/delete, 15-minute edit window, bidirectional
// block enforced inside send_message).
//
// Read / mute / archive are reconciled by *patching the affected row* rather
// than invalidating the inbox. mark_conversation_read, mark_conversation_unread
// and set_conversation_state all write to `conversation_participant` only —
// never to `conversation` — so the inbox realtime channel (which watches
// `conversation`) never fires for them and nothing else was relying on that
// invalidation. Invalidating meant every cached inbox view refetched all of
// its loaded pages just because a thread was opened, which is what made
// Inbox -> conversation -> back stall on a network round-trip.

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EditMessageBody) => api.messaging.edit(body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: messagingKeys.messages(conversationId),
      });
      // An edit can change the inbox preview text, but only for this row.
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
    mutationFn: (messageId: string) => api.messaging.remove({ messageId }),
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

// Advance the caller's read position. Called on screen focus and whenever a
// new message lands while the thread is foregrounded. Idempotent and cheap;
// the RPC clamps `upTo` to now() and only ever moves the marker forward.
//
// The row and the tab badge update the instant the thread opens, so going
// back shows an already-read inbox with no refetch at all.
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; upTo?: string }) =>
      api.messaging.markRead({
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
      // The thread header shows my own read marker; it is cheap and only
      // refetches while the conversation is actually on screen.
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(input.conversationId),
        refetchType: "active",
      });
    },
  });
}

export function useSetConversationState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetConversationStateBody) =>
      api.messaging.setState(body),
    onMutate: (body) => {
      const snapshot = snapshotLists(qc);
      if (typeof body.muted === "boolean") {
        applyConversationPatch(qc, body.conversationId, { muted: body.muted });
      }
      // Archiving moves the row between the active and archived lists, so it
      // leaves whichever list is on screen immediately.
      if (typeof body.archived === "boolean") {
        removeConversationRow(qc, body.conversationId);
      }
      return { snapshot, movedList: typeof body.archived === "boolean" };
    },
    onError: (_err, _body, ctx) => {
      if (ctx) restoreLists(qc, ctx.snapshot);
    },
    onSuccess: (_res, body, ctx) => {
      qc.invalidateQueries({
        queryKey: messagingKeys.detail(body.conversationId),
        refetchType: "active",
      });
      // Only an archive changes list *membership*, so only that needs the
      // destination list re-derived from the server. A mute is fully
      // described by the patch above.
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

// Rewind the caller's read cursor so the row reads as unread again (swipe
// action / row menu). Server clamps it to just before the last inbound
// message, and no-ops when there's nothing inbound — which the client can't
// predict, so the row is refetched once to settle on the server's truth.
export function useMarkConversationUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.messaging.markUnread({ conversationId }),
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
