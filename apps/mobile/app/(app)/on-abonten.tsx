import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { ShowcaseTile } from "@/components/showcase/ShowcaseTile";
import { useShowcaseDirectory } from "@/features/showcase/useShowcase";
import { useQueryView } from "@/lib/useQueryView";
import type { ShowcaseTile as Tile } from "@abonten/types/showcaseType";
import { AppText, EmptyState, Refresher } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";

// "See all" of the "On Abonten" wall (docs/architecture/showcase.md): every
// host and place that shows on it, standing still, in two groups. Opened
// from the wall on Explore with the explored area's point. While the wall
// is not on for this person the screen says there is nothing here.
export default function OnAbontenScreen() {
  const t = useTranslations("showcase");
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const location =
    params.lat && params.lng && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null;
  const query = useShowcaseDirectory(location);
  const view = useQueryView(
    query,
    (state) =>
      state.notFound ||
      !state.wall ||
      (state.wall.hosts.length === 0 && state.wall.places.length === 0),
  );
  const wall = query.data?.wall ?? null;
  // One clock for every tile, renewed with the data.
  const now = useMemo(
    () => (query.data ? new Date() : new Date(0)),
    [query.data],
  );

  const groups: { key: string; title: string; tiles: Tile[] }[] = wall
    ? [
        { key: "hosts", title: t("hosts"), tiles: wall.hosts },
        { key: "places", title: t("places"), tiles: wall.places },
      ].filter((g) => g.tiles.length > 0)
    : [];

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("title")}
        backFallback="/(app)/(tabs)"
      />
      {view.kind === "content" ? (
        <ScrollView
          contentContainerClassName="gap-6 px-4 pt-4 pb-16"
          refreshControl={<Refresher onRefresh={() => query.refetch()} />}
        >
          <AppText variant="body" tone="muted">
            {wall?.regionName
              ? t("directoryIntroIn", { city: wall.regionName })
              : t("directoryIntro")}
          </AppText>
          {groups.map((group) => (
            <View key={group.key} className="gap-3">
              <AppText variant="sectionTitle" accessibilityRole="header">
                {group.title}
              </AppText>
              <View className="gap-3">
                {group.tiles.map((tile) => (
                  <ShowcaseTile
                    key={tile.entryId}
                    tile={tile}
                    now={now}
                    fullWidth
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : view.kind === "empty" ? (
        <EmptyState icon="sparkles-outline" title={t("directoryEmpty")} />
      ) : (
        <QueryUnavailable
          view={view}
          subject={t("title")}
          onRetry={() => query.refetch()}
        />
      )}
    </View>
  );
}
