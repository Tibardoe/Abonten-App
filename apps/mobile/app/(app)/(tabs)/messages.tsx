import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { AddFilterSheet } from "@/components/messaging/AddFilterSheet";
import { ArchivedEntryRow } from "@/components/messaging/ArchivedEntryRow";
import { ConversationActionSheet } from "@/components/messaging/ConversationActionSheet";
import { ConversationRow } from "@/components/messaging/ConversationRow";
import { InboxFilterChips } from "@/components/messaging/InboxFilterChips";
import { InboxSearchBar } from "@/components/messaging/InboxSearchBar";
import { useInboxPrefs } from "@/features/messaging/inboxPrefs";
import type { ConversationListNarrow } from "@/features/messaging/keys";
import {
  flattenConversations,
  hasConversationsPageError,
  useConversations,
} from "@/features/messaging/useConversations";
import {
  useMarkConversationRead,
  useMarkConversationUnread,
  useSetConversationState,
} from "@/features/messaging/useMessagingActions";
import type { ConversationListItem } from "@abonten/api-client";
import {
  AppText,
  Button,
  EmptyState,
  ListFooter,
  Spinner,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

const MODE_SUBTITLE = {
  all: "All your conversations",
  member: "Chats about events and places you're attending",
  business: "Messages from people interested in your events and places",
} as const;

export default function Messages() {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id;

  const { roleScope, customFilters, setRoleScope, toggleCustomFilter } =
    useInboxPrefs(userId);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<ConversationListItem | null>(null);

  // Debounce the field before it reaches the query key (spec §3).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const wantEvents = customFilters.includes("events");
  const wantPlaces = customFilters.includes("places");
  const filter = customFilters.includes("unread") ? "unread" : "active";
  const narrow: ConversationListNarrow = useMemo(
    () => ({
      search: search || undefined,
      // Both Events + Places on = no type narrowing (can't be both).
      type:
        wantEvents === wantPlaces ? undefined : wantEvents ? "event" : "place",
      muted: customFilters.includes("muted") ? true : undefined,
    }),
    [search, wantEvents, wantPlaces, customFilters],
  );

  const q = useConversations(filter, roleScope, narrow);
  const rows = flattenConversations(q.data?.pages);
  // The mobile API returns errors as a { status, message } envelope (not a
  // thrown error), so React Query's `isError` stays false for a 401/500 —
  // fold the envelope status in so the "couldn't load / retry" UI still shows.
  const isError = q.isError || hasConversationsPageError(q.data?.pages);

  const setState = useSetConversationState();
  const markRead = useMarkConversationRead();
  const markUnread = useMarkConversationUnread();

  const onArchiveToggle = useCallback(
    (item: ConversationListItem) =>
      setState.mutate({
        conversationId: item.conversation_id,
        archived: !item.archived,
      }),
    [setState],
  );
  const onOpen = useCallback(
    (item: ConversationListItem) =>
      router.push(`/(app)/messages/${item.conversation_id}`),
    [router],
  );
  const onToggleRead = useCallback(
    (item: ConversationListItem) => {
      if (item.unread_count > 0) {
        markRead.mutate({ conversationId: item.conversation_id });
      } else {
        markUnread.mutate(item.conversation_id);
      }
    },
    [markRead, markUnread],
  );
  const onToggleMute = useCallback(
    (item: ConversationListItem) =>
      setState.mutate({
        conversationId: item.conversation_id,
        muted: !item.muted,
      }),
    [setState],
  );

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  // Stable renderItem + stable per-row handlers keep ConversationRow's
  // `memo` effective: only rows whose own data actually changed re-render,
  // instead of the whole visible window on every list state change.
  const currentUserId = session?.user.id;
  const renderRow = useCallback(
    ({ item }: { item: ConversationListItem }) => (
      <ConversationRow
        item={item}
        currentUserId={currentUserId}
        onPress={onOpen}
        onLongPress={setMenuFor}
        onArchiveToggle={onArchiveToggle}
        onToggleRead={onToggleRead}
      />
    ),
    [currentUserId, onOpen, onArchiveToggle, onToggleRead],
  );

  if (!session) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader variant="branded" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <AppText variant="sectionTitle">Sign in to Messages</AppText>
          <AppText variant="muted" className="text-center">
            Message event organizers and places without sharing your phone
            number.
          </AppText>
          <Button
            title="Sign In"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </View>
    );
  }

  const searching = search.length > 0;
  const filtered = customFilters.length > 0;

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="branded" />

      <InboxSearchBar
        value={searchInput}
        onChangeText={setSearchInput}
        onClear={() => setSearchInput("")}
      />

      <InboxFilterChips
        roleScope={roleScope}
        onRoleScopeChange={setRoleScope}
        customFilters={customFilters}
        onRemoveCustomFilter={toggleCustomFilter}
        onAddPress={() => setAddFilterOpen(true)}
      />

      {!searching ? (
        <AppText variant="meta" className="px-4 pb-1">
          {MODE_SUBTITLE[roleScope]}
        </AppText>
      ) : null}

      <FlatList
        className="flex-1"
        data={rows}
        keyExtractor={(c, i) => c?.conversation_id ?? `row-${i}`}
        renderItem={renderRow}
        ListHeaderComponent={
          searching || filtered ? null : (
            <ArchivedEntryRow
              onPress={() => router.push("/(app)/messages/archived")}
            />
          )
        }
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
              icon={
                isError
                  ? "cloud-offline-outline"
                  : searching
                    ? "search-outline"
                    : "chatbubbles-outline"
              }
              title={
                isError
                  ? "Couldn't load messages"
                  : searching
                    ? "No conversations found"
                    : roleScope === "business"
                      ? "No organizer conversations yet"
                      : filtered
                        ? "Nothing matches these filters"
                        : "No conversations yet"
              }
              description={
                isError
                  ? "Pull down to try again."
                  : searching
                    ? "Try another name, event, or place."
                    : roleScope === "business"
                      ? "When people reach out about your events or places, you'll find them here."
                      : filtered
                        ? "Remove a filter to see more."
                        : "Chat with an organizer or place when you have a question about an event, venue, or experience."
              }
              actionLabel={
                isError
                  ? "Retry"
                  : !searching && !filtered && roleScope !== "business"
                    ? "Explore events"
                    : undefined
              }
              onAction={
                isError
                  ? () => q.refetch()
                  : !searching && !filtered && roleScope !== "business"
                    ? () => router.push("/(app)/(tabs)")
                    : undefined
              }
            />
          )
        }
        ListFooterComponent={
          <ListFooter
            count={rows.length}
            isFetchingNextPage={q.isFetchingNextPage}
            hasNextPage={q.hasNextPage}
            isError={isError}
            onRetry={() => q.fetchNextPage()}
          />
        }
      />

      <AddFilterSheet
        open={addFilterOpen}
        onClose={() => setAddFilterOpen(false)}
        active={customFilters}
        onToggle={toggleCustomFilter}
      />
      <ConversationActionSheet
        item={menuFor}
        onClose={() => setMenuFor(null)}
        onToggleRead={onToggleRead}
        onToggleMute={onToggleMute}
        onToggleArchive={onArchiveToggle}
      />
    </View>
  );
}
