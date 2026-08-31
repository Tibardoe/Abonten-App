import { EventCard } from "@/components/EventCard";
import {
  useDebouncedValue,
  useEventSearch,
} from "@/features/search/useEventSearch";
import type { UserPostType } from "@abonten/types/postsType";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  View,
} from "react-native";

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
      <View className="px-4 pb-2 pt-16">
        <Text className="mb-2 text-2xl font-bold text-foreground">Search</Text>
        <TextInput
          className="rounded-md border border-border bg-card px-3 py-3 text-base text-foreground"
          placeholder="Search events…"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {!active ? (
        <Text className="mt-10 text-center text-sm text-muted-foreground">
          Type at least 2 characters.
        </Text>
      ) : q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
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
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              {q.isError ? "Search failed." : "No matching events."}
            </Text>
          }
          ListFooterComponent={
            q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
          }
        />
      )}
    </View>
  );
}
