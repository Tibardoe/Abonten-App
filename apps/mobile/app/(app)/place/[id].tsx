import { usePlaceDetail } from "@/features/places/usePlaceDetail";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { computePlaceOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeLabel(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m ?? "00"}`;
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { data: place, isLoading, isError, refetch } = usePlaceDetail(id);

  useEffect(() => {
    if (place?.name) {
      navigation.setOptions({ title: place.name });
    }
  }, [place?.name, navigation]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !place) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-muted-foreground">
          This place could not be loaded.
        </Text>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 720,
          height: 360,
        })
      : null;
  const openStatus = computePlaceOpenStatus(
    place.openingHours,
    place.temporary_status,
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-10"
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: "100%", height: 200 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-48 items-center justify-center bg-muted">
          <Text className="text-muted-foreground">No photo</Text>
        </View>
      )}

      <View className="gap-5 p-4">
        <View className="gap-1">
          <Text className="text-xl font-bold text-foreground">
            {place.name}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {place.place_category?.name}
            {place.verified ? " · Verified" : ""}
          </Text>
          <View className="mt-1 flex-row items-center gap-3">
            <Text
              className={`text-xs font-semibold ${openStatus.isOpen ? "text-success" : "text-muted-foreground"}`}
            >
              {openStatus.label}
            </Text>
            {place.reviewCount > 0 ? (
              <Text className="text-xs text-muted-foreground">
                ★ {place.avgRating.toFixed(1)} ({place.reviewCount})
              </Text>
            ) : (
              <Text className="text-xs text-muted-foreground">No reviews</Text>
            )}
          </View>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Row
            icon="location-outline"
            label={place.address?.full_address ?? "Address unavailable"}
          />
          {place.phone ? <Row icon="call-outline" label={place.phone} /> : null}
          {place.website_url ? (
            <Row icon="globe-outline" label={place.website_url} />
          ) : null}
        </View>

        {place.description ? (
          <View className="gap-2">
            <Text className="text-base font-semibold text-foreground">
              About
            </Text>
            <Text className="text-sm leading-relaxed text-muted-foreground">
              {place.description}
            </Text>
          </View>
        ) : null}

        {place.openingHours.length > 0 ? (
          <View className="gap-2">
            <Text className="text-base font-semibold text-foreground">
              Opening hours
            </Text>
            <View className="rounded-xl border border-border bg-card">
              {[...place.openingHours]
                .sort((a, b) => a.day_of_week - b.day_of_week)
                .map((h) => (
                  <View
                    key={h.day_of_week}
                    className="flex-row justify-between border-b border-border px-4 py-2 last:border-b-0"
                  >
                    <Text className="text-sm text-foreground">
                      {DAY_LABELS[h.day_of_week]}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {h.is_closed || !h.open_time || !h.close_time
                        ? "Closed"
                        : `${timeLabel(h.open_time)} – ${timeLabel(h.close_time)}`}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        ) : null}

        {place.services.length > 0 ? (
          <View className="gap-2">
            <Text className="text-base font-semibold text-foreground">
              Services
            </Text>
            {place.services.map((s) => (
              <View
                key={s.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                <View className="flex-row justify-between">
                  <Text className="text-sm font-medium text-foreground">
                    {s.name}
                  </Text>
                  {s.show_price && s.price != null ? (
                    <Text className="text-sm text-muted-foreground">
                      GHS {s.price}
                      {s.price_unit ? ` / ${s.price_unit}` : ""}
                    </Text>
                  ) : null}
                </View>
                {s.description ? (
                  <Text className="mt-1 text-xs text-muted-foreground">
                    {s.description}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Pressable className="items-center py-2" onPress={() => router.back()}>
          <Text className="text-sm text-primary">Back to browsing</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View className="flex-row gap-3">
      <Ionicons name={icon} size={18} color="#888" style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm text-foreground">{label}</Text>
    </View>
  );
}
