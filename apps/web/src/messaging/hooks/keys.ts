import type { ConversationFilter } from "@abonten/types/messagingType";

// One place for every messaging React Query key so the realtime layer and
// the mutation hooks invalidate exactly what the screens read.
export const messagingKeys = {
  all: ["messaging"] as const,
  lists: () => [...messagingKeys.all, "list"] as const,
  list: (filter: ConversationFilter) =>
    [...messagingKeys.all, "list", filter] as const,
  unreadCount: () => [...messagingKeys.all, "unread-count"] as const,
  detail: (conversationId: string) =>
    [...messagingKeys.all, "detail", conversationId] as const,
  messages: (conversationId: string) =>
    [...messagingKeys.all, "messages", conversationId] as const,
};
