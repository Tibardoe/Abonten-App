import { messagingKeys } from "@/features/messaging/keys";
import { api } from "@/lib/api";
import { uuidv4 } from "@/lib/uuid";
import type { ContentReactionEmoji } from "@abonten/types/contentType";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

export type StoryReplyOutcome =
  | { ok: true; conversationId: string }
  | { ok: false; message: string };

/**
 * Send a private reply or reaction to a Story from inside the viewer. The
 * server posts it into the viewer's conversation with the publisher; the
 * inbox caches are refreshed so the conversation is there when they look.
 *
 * One client id per attempt of the same text: a retry after a dropped
 * response lands on the same message instead of sending it twice.
 */
export function useStoryReply(postId: string) {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const attempt = useRef<{ text: string; id: string } | null>(null);

  const send = useCallback(
    async (
      kind: "text" | "reaction",
      content: string,
    ): Promise<StoryReplyOutcome> => {
      const text = content.trim();
      if (!text) return { ok: false, message: "Write a reply first." };
      if (kind === "text" && attempt.current?.text !== text) {
        attempt.current = { text, id: uuidv4() };
      }
      const clientGeneratedId =
        kind === "text" ? (attempt.current?.id ?? uuidv4()) : uuidv4();
      setSending(true);
      try {
        const res = await api.content.replyToStory({
          postId,
          kind,
          content: text,
          clientGeneratedId,
        });
        if (res.status !== 200 || !res.data) {
          return {
            ok: false,
            message:
              res.message ??
              (kind === "reaction"
                ? "Couldn't send your reaction."
                : "Couldn't send your reply."),
          };
        }
        if (kind === "text") attempt.current = null;
        qc.invalidateQueries({ queryKey: messagingKeys.lists() });
        qc.invalidateQueries({
          queryKey: messagingKeys.messages(res.data.conversationId),
        });
        return { ok: true, conversationId: res.data.conversationId };
      } catch {
        return {
          ok: false,
          message: "No connection. Your reply wasn't sent.",
        };
      } finally {
        setSending(false);
      }
    },
    [postId, qc],
  );

  return {
    sending,
    reply: (text: string) => send("text", text),
    react: (emoji: ContentReactionEmoji) => send("reaction", emoji),
  };
}
