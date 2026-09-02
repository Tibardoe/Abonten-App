import { FavoriteButton } from "@/components/FavoriteButton";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import type { PlaceType } from "@abonten/types/placeType";
import { AppText, Icon, Skeleton, Stars } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Native PlaceCard — same information and hierarchy as the web
// molecules/PlaceCard: cover with a favourite toggle, then title, a
// category / verified / open-status badge row, the address, and a rating +
// distance row.

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
          width: 420,
          height: 236,
        })
      : null;

  // Same derivation as the web PlaceCard / PlaceOpenStatusBadge:
  // temporary_status wins over the SQL-computed is_open boolean.
  const openStatus = derivePlaceCardOpenStatus(
    place.is_open,
    place.temporary_status ?? null,
  );
  const address = addressText(place.address);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-95"
      onPress={() => router.push(`/(app)/place/${place.id}`)}
    >
      <View className="relative aspect-[16/9] bg-muted">
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="image-outline" size={22} tone="muted" />
          </View>
        )}
        <View className="absolute right-2 top-2">
          <FavoriteButton kind="place" id={place.id} onSurface size={18} />
        </View>
      </View>

      <View className="gap-2 p-3">
        <AppText
          className="text-[16px] font-semibold text-foreground"
          numberOfLines={1}
        >
          {place.name}
        </AppText>

        <View className="flex-row flex-wrap items-center gap-2">
          {place.category_name ? (
            <View className="rounded-full bg-muted px-2.5 py-1">
              <AppText className="text-[11px] text-muted-foreground">
                {place.category_name}
              </AppText>
            </View>
          ) : null}
          {place.verified ? (
            <View className="flex-row items-center gap-1">
              <Icon name="checkmark-circle" size={13} tone="primary" />
              <AppText className="text-[11px] font-medium text-primary">
                Verified
              </AppText>
            </View>
          ) : null}
          <View className="flex-row items-center gap-1.5">
            <View
              className={`h-2 w-2 rounded-full ${
                openStatus.isOpen ? "bg-primary" : "bg-destructive"
              }`}
            />
            <AppText
              className={`text-[11px] font-medium ${
                openStatus.isOpen ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {openStatus.label}
            </AppText>
          </View>
        </View>

        {address ? (
          <View className="flex-row items-start gap-1.5">
            <Icon
              name="location-outline"
              size={14}
              tone="muted"
              style={{ marginTop: 2 }}
            />
            <AppText
              className="flex-1 text-[12px] text-muted-foreground"
              numberOfLines={2}
            >
              {address}
            </AppText>
          </View>
        ) : null}

        <View className="mt-0.5 flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1.5">
            <Stars rating={place.avg_rating ?? 0} size={13} />
            <AppText className="text-[12px] text-muted-foreground">
              ({place.review_count ?? 0})
            </AppText>
          </View>
          {typeof place.distance_km === "number" ? (
            <View className="rounded-full bg-muted px-2 py-1">
              <AppText className="text-[11px] text-muted-foreground">
                {place.distance_km.toFixed(1)} km away
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function PlaceCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton height={180} radius={0} />
      <View className="gap-2 p-3">
        <Skeleton width="70%" height={16} />
        <Skeleton width="55%" height={12} />
        <Skeleton width="45%" height={12} />
        <View className="mt-1 flex-row justify-between">
          <Skeleton width={90} height={16} />
          <Skeleton width={72} height={20} radius={999} />
        </View>
      </View>
    </View>
  );
}
