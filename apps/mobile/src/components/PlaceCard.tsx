import { FavoriteButton } from "@/components/FavoriteButton";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import type { PlaceType } from "@abonten/types/placeType";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

function addressText(address: PlaceType["address"]): string {
  if (address && typeof address === "object" && "full_address" in address) {
    return String((address as { full_address: string }).full_address ?? "");
  }
  return "";
}

export function PlaceCard({ place }: { place: PlaceType }) {
  const router = useRouter();
  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 360,
          height: 180,
        })
      : null;

  // Same status derivation as the web PlaceCard / PlaceOpenStatusBadge:
  // temporary_status (temporarily/permanently closed) wins over the
  // SQL-computed is_open boolean.
  const openStatus = derivePlaceCardOpenStatus(
    place.is_open,
    place.temporary_status ?? null,
  );

  return (
    <Pressable
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-90"
      onPress={() => router.push(`/(app)/place/${place.id}`)}
    >
      <View className="relative">
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

        <View className="absolute right-2 top-2">
          <FavoriteButton kind="place" id={place.id} onSurface size={18} />
        </View>
      </View>

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
          <View className="flex-row items-center gap-1.5">
            <View
              className={`h-2 w-2 rounded-full ${
                openStatus.isOpen ? "bg-primary" : "bg-destructive"
              }`}
            />
            <Text
              className={`text-[11px] font-medium ${
                openStatus.isOpen ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {openStatus.label}
            </Text>
            {typeof place.distance_km === "number" ? (
              <Text className="text-xs text-muted-foreground">
                {" "}
                · {place.distance_km.toFixed(1)} km
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
