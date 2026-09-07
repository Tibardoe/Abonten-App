import { api } from "@/lib/api";
import { uuidv4 } from "@/lib/uuid";
import type { MessageRow } from "@abonten/api-client";
import { conversationPreviewFor } from "@abonten/core/messagingInboxCache";
import type { SendMessageAttachmentInput } from "@abonten/types/messagingType";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { upsertMessageIntoCache } from "./cache";
import { bumpConversationRow } from "./inboxCache";
import { messagingKeys } from "./keys";

// A locally-staged message the user has sent but the server hasn't confirmed
// yet. Rendered in the thread with a "sending" / "failed" status until it
// reconciles. `clientGeneratedId` is the idempotency key send_message keys
// off — a retry with the same id collapses onto the same row rather than
// duplicating.
export type OutboxMessage = {
  clientGeneratedId: string;
  content: string | null;
  replyToMessageId: string | null;
  attachments: SendMessageAttachmentInput[];
  // Local file:// URIs of any staged photos, for an instant preview while the
  // send is in flight (the uploaded copy is private and would need signing).
  localPreviewUris: string[];
  // Structurally satisfies @abonten/core/messagingThread PendingMessageLike.
  hasAttachments: boolean;
  createdAt: string;
  status: "sending" | "failed";
};

export type OutboxDraft = {
  content: string | null;
  replyToMessageId?: string | null;
  attachments?: SendMessageAttachmentInput[];
  localPreviewUris?: string[];
};

// The outbox lives in component state (not persisted): a failed send stays
// visible with a Retry until the user acts or leaves the screen. Multi-device
// / reconnection correctness comes from the server being the source of truth
// — anything that actually landed comes back on the next fetch or realtime
// event and is filtered out of the rendered outbox by clientGeneratedId.
export function useMessageOutbox(conversationId: string) {
  const qc = useQueryClient();
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  // Keep the newest drafts around for retry without re-plumbing them through
  // the UI.
  const draftsRef = useRef<Map<string, OutboxDraft>>(new Map());

  const patch = useCallback(
    (clientGeneratedId: string, next: Partial<OutboxMessage>) => {
      setOutbox((prev) =>
        prev.map((m) =>
          m.clientGeneratedId === clientGeneratedId ? { ...m, ...next } : m,
        ),
      );
    },
    [],
  );

  const dispatch = useCallback(
    async (clientGeneratedId: string, draft: OutboxDraft) => {
      const res = await api.messaging.send({
        conversationId,
        clientGeneratedId,
        content: draft.content ?? null,
        replyToMessageId: draft.replyToMessageId ?? null,
        attachments: draft.attachments ?? [],
      });

      if (res.status === 200 && res.data?.message) {
        const canonical: MessageRow = res.data.message;
        // Drop the optimistic row, seed the real one into the cache so it
        // shows immediately even if the realtime INSERT is slow / missed.
        draftsRef.current.delete(clientGeneratedId);
        setOutbox((prev) =>
          prev.filter((m) => m.clientGeneratedId !== clientGeneratedId),
        );
        upsertMessageIntoCache(qc, conversationId, canonical);
        // Bump this conversation's inbox row from the message we already
        // hold instead of refetching every cached inbox view. send_message
        // also advances the sender's own last_read_at, so an outgoing
        // message never changes our unread count. Falls back to
        // invalidation only when the row isn't in any cached list yet.
        const bumped = bumpConversationRow(qc, conversationId, {
          last_message_at: canonical.created_at,
          last_message_preview: conversationPreviewFor(canonical),
          last_message_sender_id: canonical.sender_id,
        });
        if (!bumped) {
          qc.invalidateQueries({ queryKey: messagingKeys.lists() });
        }
        return;
      }

      // Blocked (403), closed conversation (409), rate-limited (429),
      // network 5xx — all land here. Keep the row, let the user retry.
      patch(clientGeneratedId, { status: "failed" });
    },
    [conversationId, patch, qc],
  );

  const send = useCallback(
    (draft: OutboxDraft) => {
      const clientGeneratedId = uuidv4();
      draftsRef.current.set(clientGeneratedId, draft);
      setOutbox((prev) => [
        {
          clientGeneratedId,
          content: draft.content ?? null,
          replyToMessageId: draft.replyToMessageId ?? null,
          attachments: draft.attachments ?? [],
          localPreviewUris: draft.localPreviewUris ?? [],
          hasAttachments:
            (draft.attachments?.length ?? 0) > 0 ||
            (draft.localPreviewUris?.length ?? 0) > 0,
          createdAt: new Date().toISOString(),
          status: "sending",
        },
        ...prev,
      ]);
      void dispatch(clientGeneratedId, draft).catch(() =>
        patch(clientGeneratedId, { status: "failed" }),
      );
    },
    [dispatch, patch],
  );

  const retry = useCallback(
    (clientGeneratedId: string) => {
      const draft = draftsRef.current.get(clientGeneratedId);
      if (!draft) {
        setOutbox((prev) =>
          prev.filter((m) => m.clientGeneratedId !== clientGeneratedId),
        );
        return;
      }
      patch(clientGeneratedId, { status: "sending" });
      void dispatch(clientGeneratedId, draft).catch(() =>
        patch(clientGeneratedId, { status: "failed" }),
      );
    },
    [dispatch, patch],
  );

  const discard = useCallback((clientGeneratedId: string) => {
    draftsRef.current.delete(clientGeneratedId);
    setOutbox((prev) =>
      prev.filter((m) => m.clientGeneratedId !== clientGeneratedId),
    );
  }, []);

  // Called by the screen once it knows which clientGeneratedIds the server
  // has confirmed (present in the fetched thread) — clears any outbox row
  // that raced ahead of its own send response.
  const reconcile = useCallback((confirmedClientIds: Set<string>) => {
    if (confirmedClientIds.size === 0) return;
    setOutbox((prev) => {
      const next = prev.filter(
        (m) => !confirmedClientIds.has(m.clientGeneratedId),
      );
      return next.length === prev.length ? prev : next;
    });
  }, []);

  return { outbox, send, retry, discard, reconcile };
}
