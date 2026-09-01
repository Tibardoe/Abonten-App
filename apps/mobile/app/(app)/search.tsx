import { EventCard } from "@/components/EventCard";
import {
  useDebouncedValue,
  useEventSearch,
} from "@/features/search/useEventSearch";
import type { UserPostType } from "@abonten/types/postsType";
import { EmptyState, Input, Muted, Spinner } from "@abonten/ui-native";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";

export default function Search() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query);
  const q = useEventSearch(debounced);

  const events: UserPostType[] = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const active = debounced.trim().length >= 2;

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pb-2 pt-4">
        <Input
          placeholder="Search events…"
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {!active ? (
        <Muted className="mt-10 text-center">Type at least 2 characters.</Muted>
      ) : q.isLoading ? (
        <Spinner className="mt-10" />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerClassName="gap-4 px-4 pb-16"
          keyboardDismissMode="on-drag"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={q.isError ? "Search failed" : "No matching events"}
              description={
                q.isError ? "Please try again." : "Try a different search term."
              }
            />
          }
          ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
        />
      )}
    </View>
  );
}
