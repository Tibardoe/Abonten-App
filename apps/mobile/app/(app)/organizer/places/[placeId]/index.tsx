import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { usePlaceInsights } from "@/features/organizer/useOrganizerPlaces";
import { usePlaceUpcomingEvents } from "@/features/places/usePlaceExtras";
import { useRewardsProgram } from "@/features/rewards/useRewards";
import { IN_APP_PROMOTION_PURCHASES } from "@/lib/storePolicy";
import { useQueryView } from "@/lib/useQueryView";
import {
  AppText,
  Icon,
  Overline,
  Refresher,
  SectionTitle,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useCarouselCardWidth } from "@abonten/ui-native/theme";
import { Link, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  View,
} from "react-native";

// Per-place management landing — the Insights tab of the web ManagePlaceView
// (ManagePlaceInsightsSection stat tiles), the place's upcoming events with
// an "Add an event here" entry into the event wizard (the web view's
// "+ Add Upcoming Event", which opens EventUploadModal with the place
// pre-selected), plus links to the other tabs.

const TILES: { key: string; label: string }[] = [
  { key: "view", label: "placeTiles.views" },
  { key: "direction_click", label: "placeTiles.directions" },
  { key: "phone_click", label: "placeTiles.phoneCalls" },
  { key: "whatsapp_click", label: "placeTiles.whatsapp" },
  { key: "favorites", label: "placeTiles.favorites" },
  { key: "reviews", label: "placeTiles.reviews" },
];

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Overline>{label}</Overline>
      <AppText variant="sectionHeading">{value}</AppText>
    </View>
  );
}

export default function PlaceManageScreen() {
  const t = useTranslations("manage");

  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const id = placeId ?? "";
  const q = usePlaceInsights(id);
  const program = useRewardsProgram();
  const visitsOn = !!(program.data?.enabled && program.data.placeVisits);

  const result = q.data;
  const insights = result && result.status === 200 ? result.data : null;
  // The server's own answer (no such place) keeps its message; loading,
  // offline and failed are told apart from it, and the tiles are never
  // drawn as zeros for figures the phone does not have.
  const definiteFailure = result !== undefined && result.status !== 200;
  const view = useQueryView(q);
  const upcoming = usePlaceUpcomingEvents(id || undefined);
  const upcomingEvents = upcoming.data ?? [];
  const upcomingView = useQueryView(upcoming, (list) => list.length === 0);
  const cardWidth = useCarouselCardWidth();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-16"
      refreshControl={
        <Refresher
          onRefresh={() => Promise.all([q.refetch(), upcoming.refetch()])}
        />
      }
    >
      {!definiteFailure && view.kind !== "content" && view.kind !== "empty" ? (
        <QueryUnavailable
          view={view}
          subject={t("thisPlaceSInsights")}
          onRetry={() => q.refetch()}
          loading={
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          }
        />
      ) : definiteFailure ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {result.message || t("couldnTLoadThisPlaceS")}
          </AppText>
          <Pressable
            accessibilityRole="button"
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <AppText className="font-semibold text-primary-foreground">
              {t("retry")}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {TILES.map((tile) => (
            <StatTile
              key={tile.key}
              label={t(tile.label)}
              value={(insights?.[tile.key] ?? 0).toLocaleString()}
            />
          ))}
        </View>
      )}

      {id ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <SectionTitle>{t("upcomingEvents")}</SectionTitle>
            <Link
              href={{ pathname: "/(app)/event/new", params: { placeId: id } }}
              asChild
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("addAnEventAtThisPlace")}
                className="min-h-[36px] flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5 active:opacity-90"
              >
                <Icon name="add" size={16} tone="inverse" />
                <AppText className="text-[13px] font-semibold text-primary-foreground">
                  {t("addEvent")}
                </AppText>
              </Pressable>
            </Link>
          </View>
          {upcomingView.kind === "loading" ? (
            <View style={{ width: cardWidth }}>
              <EventCardSkeleton />
            </View>
          ) : upcomingView.kind === "offline" ||
            upcomingView.kind === "error" ? (
            <QueryUnavailable
              view={upcomingView}
              subject="upcoming events"
              onRetry={() => upcoming.refetch()}
              className="py-4"
            />
          ) : upcomingEvents.length > 0 ? (
            <FlatList
              horizontal
              data={upcomingEvents}
              keyExtractor={(e) => e.id}
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3"
              renderItem={({ item }) => (
                <View style={{ width: cardWidth }}>
                  <EventCard event={item} />
                </View>
              )}
            />
          ) : (
            <View className="gap-1 rounded-xl border border-dashed border-border p-4">
              <AppText variant="bodyStrong">
                {t("noUpcomingEventsHereYet")}
              </AppText>
              <AppText variant="muted">
                {t("eventsYouOrOtherOrganizersPin")}
              </AppText>
            </View>
          )}
        </View>
      ) : null}

      {id ? (
        <View className="gap-2">
          <Link href={`/(app)/organizer/places/${id}/edit`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-primary bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base font-semibold text-primary">
                {t("editPlace")}
              </AppText>
              <AppText className="text-primary">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/photos`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("managePhotos")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/bookings`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("bookings")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/reviews`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("reviews")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          {visitsOn ? (
            <Link href={`/(app)/organizer/places/${id}/check-in`} asChild>
              <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
                <AppText className="text-base text-foreground">
                  {t("visitorCheckInCode")}
                </AppText>
                <AppText className="text-muted-foreground">›</AppText>
              </Pressable>
            </Link>
          ) : null}
          <Link href={`/(app)/organizer/places/${id}/verification`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("verification")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          {IN_APP_PROMOTION_PURCHASES ? (
            <Link href={`/(app)/organizer/places/${id}/promote`} asChild>
              <Pressable className="flex-row items-center justify-between rounded-xl border border-primary bg-card px-4 py-3 active:opacity-80">
                <AppText className="text-base font-semibold text-primary">
                  {t("featureThisPlace")}
                </AppText>
                <AppText className="text-primary">›</AppText>
              </Pressable>
            </Link>
          ) : null}
          <Link href={`/(app)/place/${id}`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("viewPublicPlacePage")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </ScrollView>
  );
}
