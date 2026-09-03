import { PlacePhotoManager } from "@/components/places/PlacePhotoManager";
import { usePlaceManageContext } from "@/features/organizer/useManagePlace";
import type { PlacePhotoRow } from "@abonten/api-client";
import { AppText } from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

export default function PlacePhotosScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const id = placeId ?? "";
  const q = usePlaceManageContext(id);

  const ctx = q.data && q.data.status === 200 ? q.data.data : null;
  const photos: PlacePhotoRow[] = ctx?.photos ?? [];

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (q.isError || !ctx) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <AppText className="text-center text-muted-foreground">
          {(q.data && q.data.status === 403 && q.data.message) ||
            "Couldn't load this place's photos."}
        </AppText>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => q.refetch()}
        >
          <AppText className="font-semibold text-primary-foreground">
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-16"
    >
      <PlacePhotoManager
        placeId={id}
        photos={photos}
        currentCoverPublicId={ctx.place.cover_public_id}
      />
    </ScrollView>
  );
}
