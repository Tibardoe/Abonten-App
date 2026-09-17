import {
  type StoryReplyKind,
  storyReplyNotificationBody,
} from "@abonten/core/content/storyReply";
import { logger } from "@abonten/core/logger";
import type { ContentReactionEmoji } from "@abonten/types/contentType";
import type { Database } from "@abonten/types/database.types";
import type { MessageRow } from "@abonten/types/messagingType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessagingRpcError } from "../messaging/messagingError";
import { deliverSentMessage } from "../messaging/sendMessageCore";
import { setContentReactionCore } from "./contentEngagementCore";
import { resolveContentAccess } from "./contentProgram";
import type { Envelope } from "./contentShared";

// Reply to, or react to, a Story from inside the Story viewer. The reply is
// a private message in the existing messaging system (see
// send_story_reply, migration 20260917120000), not a public comment:
//   1. the programme switches for this person are checked here (Stories on;
//      replies ride on `storiesComments`, reactions on `storiesReactions`);
//   2. a reaction is also recorded as the Story's reaction, so the
//      publisher's insights keep counting it;
//   3. the RPC runs on the CALLER's client (auth.uid() is the replier) and
//      re-checks the Story is live, not yours, replies allowed, no block;
//   4. the message is read back and the publisher notified, the same as any
//      other send.

export type StoryReplyResult = Envelope<{
  conversationId: string;
  message: MessageRow;
}>;

export async function sendStoryReplyCore(
  svc: ServiceRoleClient,
  caller: SupabaseClient<Database>,
  userId: string,
  input: {
    postId: string;
    kind: StoryReplyKind;
    content: string;
    clientGeneratedId?: string | null;
  },
): Promise<StoryReplyResult> {
  const { program } = await resolveContentAccess(svc, userId);
  if (!program.stories) return { status: 403, message: "Not available yet." };
  if (input.kind === "text" && !program.storiesComments) {
    return { status: 403, message: "Story replies are turned off right now." };
  }
  if (input.kind === "reaction" && !program.storiesReactions) {
    return { status: 403, message: "Reactions are turned off right now." };
  }

  if (input.kind === "reaction") {
    const reacted = await setContentReactionCore(svc, userId, {
      postId: input.postId,
      emoji: input.content as ContentReactionEmoji,
    });
    if (reacted.status !== 200) {
      return { status: reacted.status, message: reacted.message };
    }
  }

  const { data, error } = await caller.rpc("send_story_reply", {
    p_post_id: input.postId,
    p_content: input.content,
    p_client_generated_id: input.clientGeneratedId ?? undefined,
    p_reply_kind: input.kind,
  });
  if (error) return mapMessagingRpcError(error, "sendStoryReplyCore");

  const ids = (data ?? {}) as {
    conversation_id?: string;
    message_id?: string;
  };
  if (!ids.conversation_id || !ids.message_id) {
    logger.error("sendStoryReplyCore: RPC returned no ids");
    return { status: 500, message: "Something went wrong. Please try again." };
  }

  const sent = await deliverSentMessage(caller, userId, {
    conversationId: ids.conversation_id,
    messageId: ids.message_id,
    fallback: {
      conversationId: ids.conversation_id,
      content: input.content,
      clientGeneratedId: input.clientGeneratedId ?? null,
    },
    notificationBody: storyReplyNotificationBody(input.kind, input.content),
  });
  if (sent.status !== 200 || !sent.data) {
    // deliverSentMessage only fails when the send itself did not happen.
    return {
      status: 500,
      message: sent.message ?? "Something went wrong. Please try again.",
    };
  }
  return {
    status: 200,
    data: { conversationId: ids.conversation_id, message: sent.data.message },
  };
}
