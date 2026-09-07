import type {
  ConversationFilter,
  ConversationRoleScope,
} from "@abonten/types/messagingType";

// One place for every messaging React Query key so the realtime layer and
// the mutation hooks invalidate exactly what the screens read.
export const messagingKeys = {
  all: ["messaging"] as const,
  lists: () => [...messagingKeys.all, "list"] as const,
  list: (
    filter: ConversationFilter,
    roleScope: ConversationRoleScope = "all",
  ) => [...messagingKeys.all, "list", filter, roleScope] as const,
  unreadCount: () => [...messagingKeys.all, "unread-count"] as const,
  detail: (conversationId: string) =>
    [...messagingKeys.all, "detail", conversationId] as const,
  messages: (conversationId: string) =>
    [...messagingKeys.all, "messages", conversationId] as const,
};
