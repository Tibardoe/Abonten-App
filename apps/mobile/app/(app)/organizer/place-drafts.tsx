import {
  useDeletePlaceDraft,
  usePlaceDrafts,
} from "@/features/places/usePlaceDrafts";
import type { PlaceDraftListItem } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";

// The saved place drafts list — the native mirror of the web DraftsView's
// place tab. Tap a row to resume it in the create wizard; the trash icon
// deletes the draft (and its Cloudinary cover). Mirrors event-drafts.tsx.

function DraftRow({ draft }: { draft: PlaceDraftListItem }) {
  const router = useRouter();
  const del = useDeletePlaceDraft();

  const confirmDelete = () => {
    Alert.alert("Delete this draft?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          del.mutate(draft.id, {
            onError: () =>
              Alert.alert("Couldn't delete", "Please try again in a moment."),
          }),
      },
    ]);
  };

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Pressable
        className="flex-1 flex-row items-center gap-3 active:opacity-80"
        onPress={() => router.push(`/(app)/place/new?draftId=${draft.id}`)}
      >
        {draft.coverPublicId && draft.coverVersion ? (
          <Image
            source={{
              uri: buildCloudinaryUrl(draft.coverPublicId, draft.coverVersion, {
                width: 160,
                height: 100,
              }),
            }}
            style={{ width: 64, height: 40, borderRadius: 8 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-10 w-16 rounded-lg bg-muted" />
        )}
        <View className="flex-1">
          <AppText className="font-medium text-foreground" numberOfLines={1}>
            {draft.title?.trim() || "Untitled draft"}
          </AppText>
          <AppText variant="muted">
            Edited {getRelativeTime(draft.updatedAt)}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        onPress={confirmDelete}
        hitSlop={10}
        disabled={del.isPending}
        className="active:opacity-60 disabled:opacity-40"
        accessibilityRole="button"
        accessibilityLabel="Delete draft"
      >
        <Icon name="trash-outline" tone="destructive" size={18} />
      </Pressable>
    </View>
  );
}

export default function PlaceDraftsScreen() {
  const q = usePlaceDrafts();
  const drafts = q.data?.status === 200 ? q.data.data : [];
  const failed = q.isError || (q.data && q.data.status !== 200);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={drafts}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DraftRow draft={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      ListHeaderComponent={
        <AppText variant="screenTitle" className="mb-1">
          Place drafts
        </AppText>
      }
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
        />
      }
      ListEmptyComponent={
        q.isLoading ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <AppText className="mt-10 text-center text-sm text-muted-foreground">
            {failed
              ? "Couldn't load your drafts."
              : "No saved drafts. Start a place and tap “Save as draft”."}
          </AppText>
        )
      }
    />
  );
}
