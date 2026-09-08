import { z } from "zod";

// Shared Zod for the in-app messaging transports (web Server Actions +
// /api/mobile/messages routes). The heavy authorization / business checks
// live in the SECURITY DEFINER RPCs (open_conversation / send_message /
// ...); this layer only shapes and bounds the input. Message strings are
// plain English — the caller can override for i18n.

export const MESSAGE_MAX_LENGTH = 4000;

export const openConversationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("event"),
    eventId: z.string().uuid("A valid event is required"),
  }),
  z.object({
    type: z.literal("place"),
    placeId: z.string().uuid("A valid place is required"),
  }),
  z.object({ type: z.literal("support") }),
]);
export type OpenConversationSchemaInput = z.infer<
  typeof openConversationSchema
>;

export const sendMessageAttachmentSchema = z.object({
  storagePath: z.string().min(1).max(512),
  fileName: z.string().max(255).nullish(),
  mimeType: z.string().max(120).nullish(),
  fileSize: z
    .number()
    .int()
    .nonnegative()
    .max(10 * 1024 * 1024)
    .nullish(),
  width: z.number().int().positive().max(20000).nullish(),
  height: z.number().int().positive().max(20000).nullish(),
  // Voice-note / audio length. Capped at 10 min so a runaway recording
  // can't be claimed as an implausible duration.
  durationSeconds: z.number().positive().max(600).nullish(),
});

export const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    content: z
      .string()
      .max(MESSAGE_MAX_LENGTH, "Message is too long")
      .nullish()
      .transform((v) => (typeof v === "string" ? v : null)),
    clientGeneratedId: z.string().uuid().nullish(),
    replyToMessageId: z.string().uuid().nullish(),
    messageType: z.enum(["text", "image", "file", "audio"]).default("text"),
    attachments: z.array(sendMessageAttachmentSchema).max(10).default([]),
  })
  .superRefine((val, ctx) => {
    const hasText = !!val.content && val.content.trim().length > 0;
    if (!hasText && val.attachments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Message cannot be empty",
      });
    }
  });
export type SendMessageSchemaInput = z.infer<typeof sendMessageSchema>;

// Fixed reaction palette — mirrors MESSAGE_REACTION_EMOJIS in @abonten/types
// and the CHECK inside the toggle_message_reaction RPC. The RPC rejects
// anything else too; this is the first gate.
export const MESSAGE_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
] as const;

export const toggleMessageReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.enum(MESSAGE_REACTION_EMOJIS),
});
export type ToggleMessageReactionSchemaInput = z.infer<
  typeof toggleMessageReactionSchema
>;

export const editMessageSchema = z.object({
  messageId: z.string().uuid(),
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(MESSAGE_MAX_LENGTH, "Message is too long"),
});
export type EditMessageSchemaInput = z.infer<typeof editMessageSchema>;

export const conversationFilterSchema = z
  .enum(["active", "archived", "all", "unread"])
  .default("active");

// Optional narrowing on top of the filter + role scope: a free-text query
// (trimmed, bounded) and the predefined custom-filter dimensions. `type`
// and `muted` back the user-addable "Events / Places / Muted" chips.
export const conversationListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.enum(["event", "place", "support", "direct"]).optional(),
  muted: z.boolean().optional(),
});
export type ConversationListQuerySchemaInput = z.infer<
  typeof conversationListQuerySchema
>;

export const markConversationUnreadSchema = z.object({
  conversationId: z.string().uuid(),
});
export type MarkConversationUnreadSchemaInput = z.infer<
  typeof markConversationUnreadSchema
>;

export const setConversationStateSchema = z
  .object({
    conversationId: z.string().uuid(),
    muted: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.muted !== undefined || v.archived !== undefined, {
    message: "Nothing to update",
  });
export type SetConversationStateSchemaInput = z.infer<
  typeof setConversationStateSchema
>;

export const blockParticipantSchema = z.object({
  conversationId: z.string().uuid(),
  blockedUserId: z.string().uuid(),
  block: z.boolean(),
});
export type BlockParticipantSchemaInput = z.infer<
  typeof blockParticipantSchema
>;
