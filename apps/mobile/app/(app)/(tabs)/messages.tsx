import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { ConversationRow } from "@/components/messaging/ConversationRow";
import {
  flattenConversations,
  useConversations,
} from "@/features/messaging/useConversations";
import { useIsOrganizer, useIsPlaceOwner } from "@/features/roles/useRoles";
import type {
  ConversationFilter,
  ConversationRoleScope,
} from "@abonten/api-client";
import {
  AppText,
  Button,
  EmptyState,
  ListFooter,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

export default function Messages() {
  const router = useRouter();
  const { session } = useSession();
  const isOrganizer = useIsOrganizer();
  const isPlaceOwner = useIsPlaceOwner();
  // The customer/organizer split only means anything to someone who runs an
  // event or place; a pure customer just sees the flat list.
  const showRoleScope = isOrganizer || isPlaceOwner;

  const [filter, setFilter] = useState<ConversationFilter>("active");
  const [roleScope, setRoleScope] = useState<ConversationRoleScope>("all");
  const q = useConversations(filter, showRoleScope ? roleScope : "all");
  // The inbox realtime channel is mounted once by the tabs layout, so it
  // stays live on every tab; no need to re-subscribe here.

  const rows = flattenConversations(q.data?.pages);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

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

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="branded" />
      {showRoleScope ? (
        <View className="px-4 pb-1 pt-3">
          <SegmentedTabs
            options={[
              { key: "all", label: "All" },
              { key: "member", label: "As customer" },
              { key: "business", label: "As organizer" },
            ]}
            value={roleScope}
            onChange={(k) => setRoleScope(k as ConversationRoleScope)}
          />
        </View>
      ) : null}
      <View className="px-4 pb-1 pt-3">
        <SegmentedTabs
          options={[
            { key: "active", label: "Active" },
            { key: "archived", label: "Archived" },
          ]}
          value={filter === "archived" ? "archived" : "active"}
          onChange={(k) => setFilter(k as ConversationFilter)}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(c) => c.conversation_id}
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            currentUserId={session.user.id}
            onPress={() =>
              router.push(`/(app)/messages/${item.conversation_id}`)
            }
          />
        )}
        contentContainerClassName="gap-2 px-4 pb-16 pt-2"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching && !q.isFetchingNextPage}
            onRefresh={() => q.refetch()}
          />
        }
        ListEmptyComponent={
          q.isLoading ? (
            <View className="pt-10 items-center py-10">
              <Spinner />
            </View>
          ) : (
            <EmptyState
              icon={q.isError ? "cloud-offline-outline" : "chatbubbles-outline"}
              title={
                q.isError
                  ? "Couldn't load messages"
                  : filter === "archived"
                    ? "No archived chats"
                    : "No messages yet"
              }
              description={
                q.isError
                  ? "Pull down to try again."
                  : "Open an event or place and tap Message to start a conversation."
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
