import { usePlaceInsights } from "@/features/organizer/useOrganizerPlaces";
import { AppText, Overline } from "@abonten/ui-native";
import { Link, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

// Per-place management landing — the Insights tab of the web ManagePlaceView
// (ManagePlaceInsightsSection stat tiles), plus links to the other tabs as
// they land.

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

  const result = q.data;
  const insights = result && result.status === 200 ? result.data : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-16"
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
        />
      }
    >
      <AppText variant="screenTitle">Place insights</AppText>

      {q.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator />
        </View>
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {(result && result.status === 404 && result.message) ||
              "Couldn't load this place's insights."}
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
