import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type {
  MessageRow,
  MessagingEnvelope,
  SendMessageInput,
} from "@abonten/types/messagingType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { mapMessagingRpcError } from "./messagingError";

// Post-auth body of the "send" action / POST /api/mobile/messages/send.
//
// The send itself is the send_message RPC (SECURITY DEFINER) run on the
// caller's session client — it does the participant / block / closed /
// rate-limit / attachment-prefix checks and is idempotent on
// client_generated_id. Afterwards we:
//   1. read the freshly-inserted row back (RLS-scoped) so the caller and
//      realtime subscribers converge on one canonical shape;
//   2. fan a best-effort notification + push out to the OTHER participants
//      via createNotificationCore (service role — `notification` has no
//      client INSERT policy). Muted participants are skipped. A failure
//      here never fails the send.

type SendResult = MessagingEnvelope<{ message: MessageRow }>;

export async function sendMessageCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SendMessageInput,
): Promise<SendResult> {
  const attachments = (input.attachments ?? []).map((a) => ({
    storage_path: a.storagePath,
    file_name: a.fileName ?? null,
    mime_type: a.mimeType ?? null,
    file_size: a.fileSize ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
  }));

  const { data: messageId, error } = await supabase.rpc("send_message", {
    p_conversation_id: input.conversationId,
    p_content: input.content ?? undefined,
    p_client_generated_id: input.clientGeneratedId ?? undefined,
    p_reply_to_message_id: input.replyToMessageId ?? undefined,
    p_message_type: input.messageType ?? "text",
    p_attachments: attachments,
  } as unknown as Database["public"]["Functions"]["send_message"]["Args"]);

  if (error) {
    return mapMessagingRpcError(error, "sendMessageCore");
  }
  if (!messageId) {
    logger.error("sendMessageCore: RPC returned no message id");
    return { status: 500, message: "Something went wrong. Please try again." };
  }

  const message = await readMessage(supabase, messageId as string);
  if (!message) {
    // The send succeeded; only the read-back failed. Return a minimal row.
    return {
      status: 200,
      data: {
        message: minimalRow(messageId as string, input, userId),
      },
    };
  }

  // Best-effort notification fan-out — never blocks or fails the send.
  notifyOtherParticipants(supabase, {
    conversationId: input.conversationId,
    senderId: userId,
    message,
  }).catch((e) => logger.error(`sendMessageCore: notify failed: ${e}`));

  return { status: 200, data: { message } };
}

async function readMessage(
  supabase: SupabaseClient<Database>,
  messageId: string,
): Promise<MessageRow | null> {
  const { data, error } = await supabase
    .from("message")
    .select(
      "id, conversation_id, sender_id, message_type, content, system_event, system_data, reply_to_message_id, client_generated_id, moderation_state, created_at, edited_at, deleted_at",
    )
    .eq("id", messageId)
    .maybeSingle();

  if (error || !data) {
    if (error)
      logger.error(`sendMessageCore: read-back failed: ${error.message}`);
    return null;
  }

  const { data: atts } = await supabase
    .from("message_attachment")
    .select("*")
    .eq("message_id", messageId);

  return {
    id: data.id,
    conversation_id: data.conversation_id,
    sender_id: data.sender_id,
    message_type: data.message_type as MessageRow["message_type"],
    content: data.content,
    system_event: data.system_event,
    system_data: (data.system_data as Record<string, unknown>) ?? {},
    reply_to_message_id: data.reply_to_message_id,
    client_generated_id: data.client_generated_id,
    moderation_state: data.moderation_state as MessageRow["moderation_state"],
    created_at: data.created_at,
    edited_at: data.edited_at,
    deleted_at: data.deleted_at,
    attachments: (atts ?? []) as MessageRow["attachments"],
    reply_to: null,
  };
}

function minimalRow(
  id: string,
  input: SendMessageInput,
  senderId: string,
): MessageRow {
  return {
    id,
    conversation_id: input.conversationId,
    sender_id: senderId,
    message_type: input.messageType ?? "text",
    content: input.content ?? null,
    system_event: null,
    system_data: {},
    reply_to_message_id: input.replyToMessageId ?? null,
    client_generated_id: input.clientGeneratedId ?? null,
    moderation_state: "visible",
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    attachments: [],
    reply_to: null,
  };
}

async function notifyOtherParticipants(
  supabase: SupabaseClient<Database>,
  args: { conversationId: string; senderId: string; message: MessageRow },
): Promise<void> {
  const { conversationId, senderId, message } = args;

  const { data: participants } = await supabase
    .from("conversation_participant")
    .select("user_id, muted, left_at")
    .eq("conversation_id", conversationId);

  const recipients = (
    (participants ?? []) as {
      user_id: string;
      muted: boolean;
      left_at: string | null;
    }[]
  ).filter((p) => p.user_id !== senderId && !p.muted && p.left_at === null);

  if (recipients.length === 0) return;

  const { data: conv } = await supabase
    .from("conversation")
    .select("title, type")
    .eq("id", conversationId)
    .maybeSingle();

  const { data: sender } = await supabase
    .from("user_info")
    .select("full_name, username")
    .eq("id", senderId)
    .maybeSingle();

  const senderName =
    sender?.full_name || sender?.username || conv?.title || "New message";
  const preview = messagePreview(message);

  let service: SupabaseClient<Database>;
  try {
    service = getSupabaseServiceClient();
  } catch {
    // No service-role env (e.g. an unusual test harness) — skip push/notify
    // rather than let the whole send report a failure.
    return;
  }

  await Promise.allSettled(
    recipients.map((r) =>
      createNotificationCore(service, {
        userId: r.user_id,
        type: "message",
        title: senderName,
        body: preview,
        link: `/messages/${conversationId}`,
        data: { kind: "message", conversationId },
      }),
    ),
  );
}

function messagePreview(message: MessageRow): string {
  if (message.content && message.content.trim().length > 0) {
    return message.content.trim().slice(0, 140);
  }
  if (message.message_type === "image") return "📷 Photo";
  if (message.message_type === "file") return "📎 Attachment";
  return "New message";
}
