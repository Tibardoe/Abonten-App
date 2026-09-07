import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { ConversationRow } from "@/components/messaging/ConversationRow";
import { InboxSearchBar } from "@/components/messaging/InboxSearchBar";
import {
  flattenConversations,
  useConversations,
} from "@/features/messaging/useConversations";
import { useSetConversationState } from "@/features/messaging/useMessagingActions";
import type { ConversationListItem } from "@abonten/api-client";
import { EmptyState, ListFooter, Spinner } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

// Dedicated Archived destination (spec §14). Back nav + its own search +
// the archived conversation list; swipe right to unarchive.
export default function ArchivedMessages() {
  const router = useRouter();
  const { session } = useSession();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const q = useConversations("archived", "all", {
    search: search || undefined,
  });
  const rows = flattenConversations(q.data?.pages);
  const setState = useSetConversationState();

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  const unarchive = useCallback(
    (item: ConversationListItem) =>
      setState.mutate({
        conversationId: item.conversation_id,
        archived: false,
      }),
    [setState],
  );

  const onOpen = useCallback(
    (item: ConversationListItem) =>
      router.push(`/(app)/messages/${item.conversation_id}`),
    [router],
  );

  // Stable renderItem + handlers so ConversationRow's `memo` actually holds.
  const currentUserId = session?.user.id;
  const renderRow = useCallback(
    ({ item }: { item: ConversationListItem }) => (
      <ConversationRow
        item={item}
        currentUserId={currentUserId}
        archivedView
        onPress={onOpen}
        onArchiveToggle={unarchive}
      />
    ),
    [currentUserId, onOpen, unarchive],
  );

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="Archived" />

      <InboxSearchBar
        value={searchInput}
        onChangeText={setSearchInput}
        onClear={() => setSearchInput("")}
        placeholder="Search archived"
      />

      <FlatList
        className="flex-1"
        data={rows}
        keyExtractor={(c) => c.conversation_id}
        renderItem={renderRow}
        contentContainerClassName="pb-16"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching && !q.isFetchingNextPage}
            onRefresh={() => q.refetch()}
          />
        }
        ListEmptyComponent={
          q.isLoading ? (
            <View className="items-center py-16">
              <Spinner />
            </View>
          ) : (
            <EmptyState
              icon={q.isError ? "cloud-offline-outline" : "archive-outline"}
              title={
                q.isError
                  ? "Couldn't load archived chats"
                  : search
                    ? "No conversations found"
                    : "No archived chats"
              }
              description={
                q.isError
                  ? "Pull down to try again."
                  : search
                    ? "Try another name, event, or place."
                    : "Conversations you archive show up here. Swipe one left to bring it back."
              }
              actionLabel={q.isError ? "Retry" : undefined}
              onAction={q.isError ? () => q.refetch() : undefined}
            />
          )
        }
        ListFooterComponent={
          <ListFooter
            count={rows.length}
            isFetchingNextPage={q.isFetchingNextPage}
            hasNextPage={q.hasNextPage}
            isError={q.isError}
            onRetry={() => q.fetchNextPage()}
          />
        }
      />
    </View>
  );
}
