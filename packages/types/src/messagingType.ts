// Types for the in-app messaging system (Phase 1 schema:
// supabase/migrations/20260907090000_messaging_schema.sql +
// 20260907090100_messaging_rpcs.sql). Manual interface, same style as
// notificationType.ts / placeType.ts — DB row shapes are snake_case to
// mirror the tables, transport inputs are camelCase.

export type ConversationType = "event" | "place" | "support" | "direct";

export type ConversationParticipantRole =
  | "member"
  | "organizer"
  | "place_owner"
  | "staff"
  | "admin";

export type MessageType = "text" | "image" | "file" | "system";

export type MessagingModerationState = "visible" | "hidden" | "removed";

export type ConversationFilter = "active" | "archived" | "all" | "unread";

// Which side of the conversation the caller is on — for the unified inbox's
// "All / As customer / As organizer" split (Phase 6). `member` = I opened it
// as a customer; `business` = I'm the organizer / place owner / staff.
export type ConversationRoleScope = "all" | "member" | "business";

// The user-addable inbox filter chips (spec §9–10). Backed by predefined,
// safe filter definitions on list_conversations — never arbitrary client
// SQL. `unread` reuses ConversationFilter; the rest narrow by conversation
// type or the caller's mute flag.
export type ConversationCustomFilter = "unread" | "events" | "places" | "muted";

// Optional narrowing passed to list_conversations on top of the
// active/archived filter + role scope: a trimmed free-text query and the
// predefined custom-filter dimensions.
export type ConversationListQuery = {
  search?: string | null;
  type?: ConversationType | null;
  muted?: boolean | null;
};

// ---- rows --------------------------------------------------------------

export type MessageAttachmentRow = {
  id: string;
  message_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
};

// The trimmed shape shown in a "replying to" quote — never carries its own
// attachments or reply chain.
export type MessageReplyPreview = {
  id: string;
  sender_id: string | null;
  message_type: MessageType;
  content: string | null;
  deleted_at: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  message_type: MessageType;
  content: string | null;
  system_event: string | null;
  system_data: Record<string, unknown>;
  reply_to_message_id: string | null;
  client_generated_id: string | null;
  moderation_state: MessagingModerationState;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments: MessageAttachmentRow[];
  reply_to: MessageReplyPreview | null;
};

export type ConversationParticipantRow = {
  user_id: string;
  role: ConversationParticipantRole;
  last_read_at: string;
  muted: boolean;
  archived: boolean;
  left_at: string | null;
};

export type ConversationParticipantProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
};

// One row of the inbox list — the shape returned by the list_conversations
// RPC, plus the resolved display fields the UI needs.
export type ConversationListItem = {
  conversation_id: string;
  type: ConversationType;
  event_id: string | null;
  place_id: string | null;
  title: string | null;
  status: "open" | "closed";
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  my_role: ConversationParticipantRole;
  my_last_read_at: string;
  muted: boolean;
  archived: boolean;
  unread_count: number;
  other_participant_ids: string[];
  created_at: string;
  // Resolved display fields (added by list_conversations for the inbox
  // redesign). subject_title = the live event title / place name;
  // other_* = the single primary other participant (the business side for a
  // customer's row, the customer for a business row). All null for a
  // support conversation, which has no other participant.
  subject_title: string | null;
  other_user_id: string | null;
  other_display_name: string | null;
  other_username: string | null;
  other_avatar_public_id: string | null;
  other_avatar_version: string | null;
};

export type ConversationSubjectContext = {
  event: {
    id: string;
    title: string;
    slug: string;
    event_code: string;
    starts_at: string | null;
    status: string;
    address: unknown;
  } | null;
  place: {
    id: string;
    name: string;
    slug: string;
    status: string;
    address: unknown;
  } | null;
};

// The header/context payload for one open conversation.
export type ConversationContext = {
  id: string;
  type: ConversationType;
  status: "open" | "closed";
  title: string | null;
  moderation_state: MessagingModerationState;
  subject: ConversationSubjectContext;
  my_participant: ConversationParticipantRow;
  participants: (ConversationParticipantRow & {
    profile: ConversationParticipantProfile | null;
  })[];
  blocked_user_ids: string[];
};

// ---- transport inputs ------------------------------------------------

export type OpenConversationInput =
  | { type: "event"; eventId: string }
  | { type: "place"; placeId: string }
  | { type: "support" };

export type SendMessageAttachmentInput = {
  storagePath: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
};

export type SendMessageInput = {
  conversationId: string;
  content?: string | null;
  clientGeneratedId?: string | null;
  replyToMessageId?: string | null;
  messageType?: Exclude<MessageType, "system">;
  attachments?: SendMessageAttachmentInput[];
};

export type SetConversationStateInput = {
  conversationId: string;
  muted?: boolean;
  archived?: boolean;
};

export type BlockParticipantInput = {
  conversationId: string;
  blockedUserId: string;
  block: boolean;
};

// ---- envelopes ------------------------------------------------------

export type MessagingEnvelope<T> = {
  status: number;
  message?: string;
  data?: T;
};

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_EDIT_WINDOW_MINUTES = 15;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;
export const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";
