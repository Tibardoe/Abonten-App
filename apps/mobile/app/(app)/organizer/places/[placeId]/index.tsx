import { usePlaceInsights } from "@/features/organizer/useOrganizerPlaces";
import { Link, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
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
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="text-lg font-bold text-foreground">{value}</Text>
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
      <Text className="text-xl font-bold text-foreground">Place insights</Text>

      {q.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator />
        </View>
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <Text className="text-center text-muted-foreground">
            {(result && result.status === 404 && result.message) ||
              "Couldn't load this place's insights."}
          </Text>
          <Pressable
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <Text className="font-semibold text-primary-foreground">Retry</Text>
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
              <Text className="text-base font-semibold text-primary">
                Edit place
              </Text>
              <Text className="text-primary">›</Text>
            </Pressable>
          </Link>
          <Link href={`/(app)/place/${id}`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <Text className="text-base text-foreground">
                View public place page
              </Text>
              <Text className="text-muted-foreground">›</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </ScrollView>
  );
}
