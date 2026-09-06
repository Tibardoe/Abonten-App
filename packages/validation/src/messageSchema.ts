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
export type OpenConversationSchemaInput = z.infer<typeof openConversationSchema>;

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
    messageType: z.enum(["text", "image", "file"]).default("text"),
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
export type BlockParticipantSchemaInput = z.infer<typeof blockParticipantSchema>;
