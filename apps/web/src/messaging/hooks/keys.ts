import type {
  ConversationFilter,
  ConversationRoleScope,
} from "@abonten/types/messagingType";

// Narrowing applied on top of filter + role scope (search bar + the
// user-addable Events / Places / Muted chips). Part of the list query key
// so each distinct view keeps its own cache entry.
export type ConversationListNarrow = {
  search?: string;
  type?: "event" | "place" | "support" | "direct";
  muted?: boolean;
};

// One place for every messaging React Query key so the realtime layer and
// the mutation hooks invalidate exactly what the screens read.
export const messagingKeys = {
  all: ["messaging"] as const,
  lists: () => [...messagingKeys.all, "list"] as const,
  list: (
    filter: ConversationFilter,
    roleScope: ConversationRoleScope = "all",
    narrow: ConversationListNarrow = {},
  ) =>
    [
      ...messagingKeys.all,
      "list",
      filter,
      roleScope,
      narrow.search ?? "",
      narrow.type ?? "",
      narrow.muted ?? false,
    ] as const,
  unreadCount: () => [...messagingKeys.all, "unread-count"] as const,
  detail: (conversationId: string) =>
    [...messagingKeys.all, "detail", conversationId] as const,
  messages: (conversationId: string) =>
    [...messagingKeys.all, "messages", conversationId] as const,
};
