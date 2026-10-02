import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  flattenOrganizerPlaces,
  useOrganizerPlaces,
} from "@/features/organizer/useOrganizerPlaces";
import { useQueryView } from "@/lib/useQueryView";
import type { OrganizerPlaceRow } from "@abonten/api-client";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { AppText, Refresher } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

const CLOSED_LABEL: Record<string, string> = {
  permanently_closed: "permanentlyClosed",
  temporarily_closed: "temporarilyClosed",
};

function OrganizerPlaceCard({ place }: { place: OrganizerPlaceRow }) {
  const t = useTranslations("manage");
  const tc = useTranslations("core");

  const router = useRouter();
  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 200,
          height: 200,
        })
      : null;
  const closed = place.temporary_status
    ? CLOSED_LABEL[place.temporary_status]
      ? t(CLOSED_LABEL[place.temporary_status])
      : null
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row gap-3 rounded-xl border border-border bg-card p-3 active:opacity-90"
      onPress={() => router.push(`/(app)/organizer/places/${place.id}`)}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: 64, height: 64, borderRadius: 8 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-16 w-16 items-center justify-center rounded-lg bg-muted">
          <AppText variant="caption">{t("noImage")}</AppText>
        </View>
      )}
      <View className="flex-1 justify-center gap-1">
        <AppText
          className="text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
          {place.name}
        </AppText>
        <AppText
          className="text-[13px] text-muted-foreground"
          numberOfLines={1}
        >
          {placeCategoryLabel(tc, place.place_category ?? {}) ||
            t("uncategorized")}
          {closed ? ` · ${closed}` : ""}
        </AppText>
      </View>
      <AppText className="self-center text-muted-foreground">›</AppText>
    </Pressable>
  );
}

export default function OrganizerPlacesScreen() {
  const t = useTranslations("manage");

  const q = useOrganizerPlaces();
  const places = flattenOrganizerPlaces(q.data?.pages);
  // "No places yet" is only ever said for an answer the server gave;
  // loading, offline and failed are told apart.
  const view = useQueryView(q, () => places.length === 0);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={places}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <OrganizerPlaceCard place={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      ListHeaderComponent={
        <View className="mb-1 flex-row items-center justify-between">
          <AppText variant="screenTitle">{t("myPlaces2")}</AppText>
          <Link href="/(app)/place/new" asChild>
            <Pressable className="rounded-lg bg-primary px-3 py-1.5 active:opacity-90">
              <AppText className="text-sm font-semibold text-primary-foreground">
                {t("addPlace")}
              </AppText>
            </Pressable>
          </Link>
        </View>
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      ListEmptyComponent={
        view.kind === "empty" ? (
          <AppText className="mt-10 text-center text-sm text-muted-foreground">
            {t("youHavenTAddedAnyPlaces")}
          </AppText>
        ) : (
          <QueryUnavailable
            view={view}
            subject={t("yourPlaces3")}
            onRetry={() => q.refetch()}
            loading={<ActivityIndicator className="mt-10" />}
          />
        )
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
      }
    />
  );
}
