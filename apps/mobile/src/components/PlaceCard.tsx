import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { PlaceType } from "@abonten/types/placeType";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

function addressText(address: PlaceType["address"]): string {
  if (address && typeof address === "object" && "full_address" in address) {
    return String((address as { full_address: string }).full_address ?? "");
  }
  return "";
}

export function PlaceCard({ place }: { place: PlaceType }) {
  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 360,
          height: 180,
        })
      : null;

  return (
    <Pressable className="overflow-hidden rounded-xl border border-border bg-card active:opacity-90">
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: "100%", height: 160 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-40 items-center justify-center bg-muted">
          <Text className="text-muted-foreground">No photo</Text>
        </View>
      )}

      <View className="gap-1 p-3">
        <Text
          className="text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          {place.name}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {place.category_name}
          {addressText(place.address) ? ` · ${addressText(place.address)}` : ""}
        </Text>
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-xs text-muted-foreground">
            {place.avg_rating != null
              ? `★ ${place.avg_rating.toFixed(1)} (${place.review_count})`
              : "No reviews"}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text
              className={`text-[10px] font-semibold uppercase ${place.is_open ? "text-success" : "text-muted-foreground"}`}
            >
              {place.is_open ? "Open" : "Closed"}
            </Text>
            {typeof place.distance_km === "number" ? (
              <Text className="text-xs text-muted-foreground">
                {place.distance_km.toFixed(1)} km
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
