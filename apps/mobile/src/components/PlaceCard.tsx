import { FavoriteButton } from "@/components/FavoriteButton";
import { CardImageScrim } from "@/components/cards/CardImageScrim";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import type { PlaceType } from "@abonten/types/placeType";
import { AppText, Icon, Skeleton, Stars } from "@abonten/ui-native";
import { shadow } from "@abonten/ui-native/theme";
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

export function PlaceCard({
  place,
  sponsored = false,
}: {
  place: PlaceType;
  /** Featured (paid-placement) slot — shows a neutral "Sponsored" pill. */
  sponsored?: boolean;
}) {
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

  const rating = place.avg_rating ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      className="overflow-hidden rounded-2xl border border-border bg-card active:opacity-95"
      style={shadow.card}
      onPress={() => router.push(`/(app)/place/${place.id}`)}
    >
      <View className="relative aspect-[3/2] bg-muted">
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="image-outline" size={24} tone="muted" />
          </View>
        )}

        <CardImageScrim />

        <View className="absolute left-2.5 top-2.5 flex-row gap-1.5">
          {sponsored ? (
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: "rgba(17,24,32,0.72)" }}
            >
              <AppText className="text-[10px] font-medium text-white">
                Sponsored
              </AppText>
            </View>
          ) : null}
          {typeof place.distance_km === "number" ? (
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: "rgba(17,24,32,0.55)" }}
            >
              <AppText className="text-[10px] font-medium text-white">
                {place.distance_km.toFixed(1)} km
              </AppText>
            </View>
          ) : null}
        </View>

        <View className="absolute right-2.5 top-2.5">
          <FavoriteButton kind="place" id={place.id} onSurface size={18} />
        </View>

        {rating > 0 ? (
          <View className="absolute bottom-2.5 left-2.5 flex-row items-center gap-1 rounded-full bg-card px-2.5 py-1">
            <Stars rating={rating} size={12} />
            <AppText className="text-[11px] font-semibold text-foreground">
              {rating.toFixed(1)}
            </AppText>
            <AppText className="text-[11px] text-muted-foreground">
              ({place.review_count ?? 0})
            </AppText>
          </View>
        ) : null}
      </View>

      <View className="gap-1.5 p-3.5">
        <View className="flex-row items-center gap-1.5">
          <AppText variant="cardTitle" numberOfLines={1} className="flex-1">
            {place.name}
          </AppText>
          {place.verified ? (
            <Icon name="checkmark-circle" size={15} tone="primary" />
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          {place.category_name ? (
            <AppText
              className="text-[12px] text-muted-foreground"
              numberOfLines={1}
            >
              {place.category_name}
            </AppText>
          ) : null}
          <View className="flex-row items-center gap-1">
            <View
              className={`h-1.5 w-1.5 rounded-full ${
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
          <View className="flex-row items-center gap-1.5">
            <Icon name="location-outline" size={13} tone="muted" />
            <AppText
              className="flex-1 text-[12px] text-muted-foreground"
              numberOfLines={1}
            >
              {address}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function PlaceCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="aspect-[3/2] w-full">
        <Skeleton width="100%" radius={0} style={{ flex: 1 }} />
      </View>
      <View className="gap-2 p-3.5">
        <Skeleton width="65%" height={15} />
        <Skeleton width="45%" height={12} />
        <Skeleton width="70%" height={12} />
      </View>
    </View>
  );
}
