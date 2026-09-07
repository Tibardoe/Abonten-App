"use client";

import { sendMessage } from "@/actions/sendMessage";
import type {
  MessageRow,
  SendMessageAttachmentInput,
} from "@abonten/types/messagingType";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { upsertMessageIntoCache } from "./cache";
import { messagingKeys } from "./keys";

// A locally-staged message the user has sent but the server hasn't confirmed
// yet. Rendered in the thread with a "sending" / "failed" status until it
// reconciles. `clientGeneratedId` is the idempotency key send_message keys
// off — a retry with the same id collapses onto the same row.
export type OutboxMessage = {
  clientGeneratedId: string;
  content: string | null;
  replyToMessageId: string | null;
  attachments: SendMessageAttachmentInput[];
  // Object URLs for staged images — instant preview while the send is in
  // flight (the uploaded copy is private and would need signing).
  localPreviewUrls: string[];
  // Structurally satisfies @abonten/core/messagingThread PendingMessageLike.
  hasAttachments: boolean;
  createdAt: string;
  status: "sending" | "failed";
};

export type OutboxDraft = {
  content: string | null;
  replyToMessageId?: string | null;
  attachments?: SendMessageAttachmentInput[];
  localPreviewUrls?: string[];
};

// The outbox lives in component state (not persisted): a failed send stays
// visible with a Retry until the user acts or navigates away. Multi-device /
// reconnection correctness comes from the server being the source of truth —
// anything that actually landed comes back on the next fetch or realtime
// event and is filtered out of the rendered outbox by clientGeneratedId.
export function useMessageOutbox(conversationId: string) {
  const qc = useQueryClient();
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
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
      const res = await sendMessage({
        conversationId,
        clientGeneratedId,
        content: draft.content ?? null,
        replyToMessageId: draft.replyToMessageId ?? null,
        attachments: draft.attachments ?? [],
      });

      if (res.status === 200 && "data" in res && res.data?.message) {
        const canonical: MessageRow = res.data.message;
        draftsRef.current.delete(clientGeneratedId);
        setOutbox((prev) =>
          prev.filter((m) => m.clientGeneratedId !== clientGeneratedId),
        );
        upsertMessageIntoCache(qc, conversationId, canonical);
        qc.invalidateQueries({ queryKey: messagingKeys.lists() });
        qc.invalidateQueries({ queryKey: messagingKeys.unreadCount() });
        return;
      }

      // Blocked (403), closed conversation (409), rate-limited (429), 5xx —
      // all land here. Keep the row, let the user retry.
      patch(clientGeneratedId, { status: "failed" });
    },
    [conversationId, patch, qc],
  );

  const send = useCallback(
    (draft: OutboxDraft) => {
      const clientGeneratedId = crypto.randomUUID();
      draftsRef.current.set(clientGeneratedId, draft);
      setOutbox((prev) => [
        {
          clientGeneratedId,
          content: draft.content ?? null,
          replyToMessageId: draft.replyToMessageId ?? null,
          attachments: draft.attachments ?? [],
          localPreviewUrls: draft.localPreviewUrls ?? [],
          hasAttachments:
            (draft.attachments?.length ?? 0) > 0 ||
            (draft.localPreviewUrls?.length ?? 0) > 0,
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

  return { outbox, send, retry, reconcile };
}
