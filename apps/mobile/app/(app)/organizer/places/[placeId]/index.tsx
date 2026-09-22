import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { usePlaceInsights } from "@/features/organizer/useOrganizerPlaces";
import { usePlaceUpcomingEvents } from "@/features/places/usePlaceExtras";
import { useRewardsProgram } from "@/features/rewards/useRewards";
import { useQueryView } from "@/lib/useQueryView";
import {
  AppText,
  Icon,
  Overline,
  Refresher,
  SectionTitle,
} from "@abonten/ui-native";
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
  { key: "view", label: "Place Views" },
  { key: "direction_click", label: "Directions" },
  { key: "phone_click", label: "Phone Calls" },
  { key: "whatsapp_click", label: "WhatsApp" },
  { key: "favorites", label: "Favorites" },
  { key: "reviews", label: "Reviews" },
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
          subject="this place's insights"
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
            {result.message || "Couldn't load this place's insights."}
          </AppText>
          <Pressable
            accessibilityRole="button"
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <AppText className="font-semibold text-primary-foreground">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {TILES.map((t) => (
            <StatTile
              key={t.key}
              label={t.label}
              value={(insights?.[t.key] ?? 0).toLocaleString()}
            />
          ))}
        </View>
      )}

      {id ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <SectionTitle>Upcoming events</SectionTitle>
            <Link
              href={{ pathname: "/(app)/event/new", params: { placeId: id } }}
              asChild
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add an event at this place"
                className="min-h-[36px] flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5 active:opacity-90"
              >
                <Icon name="add" size={16} tone="inverse" />
                <AppText className="text-[13px] font-semibold text-primary-foreground">
                  Add event
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
                No upcoming events here yet
              </AppText>
              <AppText variant="muted">
                Events you or other organizers pin to this place show up on its
                public page. Tap Add event to post one.
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
                Edit place
              </AppText>
              <AppText className="text-primary">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/photos`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                Manage photos
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/bookings`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">Bookings</AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/reviews`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">Reviews</AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          {visitsOn ? (
            <Link href={`/(app)/organizer/places/${id}/check-in`} asChild>
              <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
                <AppText className="text-base text-foreground">
                  Visitor check-in code
                </AppText>
                <AppText className="text-muted-foreground">›</AppText>
              </Pressable>
            </Link>
          ) : null}
          <Link href={`/(app)/organizer/places/${id}/verification`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                Verification
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/places/${id}/promote`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-primary bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base font-semibold text-primary">
                Feature this place
              </AppText>
              <AppText className="text-primary">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/place/${id}`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                View public place page
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </ScrollView>
  );
}
