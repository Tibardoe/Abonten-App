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
// places/molecules/PlaceCard: a clean cover, then a title + favourite row, a
// category / verified / open-status badge row, the address, and a
// rating + "X km away" row. As with EventCard the favourite toggle stays on
// the image (app-wide convention) rather than sitting in the title row.

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

        {sponsored ? (
          <View
            className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: "rgba(17,24,32,0.72)" }}
          >
            <AppText className="text-[10px] font-medium text-white">
              Sponsored
            </AppText>
          </View>
        ) : null}

        <View className="absolute right-2.5 top-2.5">
          <FavoriteButton kind="place" id={place.id} onSurface size={18} />
        </View>
      </View>

      <View className="gap-2.5 p-3.5">
        <View className="flex-row items-start gap-2">
          <AppText variant="cardTitle" numberOfLines={2} className="flex-1">
            {place.name}
          </AppText>
          {place.verified ? (
            <Icon name="checkmark-circle" size={16} tone="primary" />
          ) : null}
        </View>

        {/* category / open-status pill row — web's flex-wrap badge row */}
        <View className="flex-row flex-wrap items-center gap-1.5">
          {place.category_name ? (
            <View className="rounded-full bg-muted px-2.5 py-1">
              <AppText className="text-[11px] text-muted-foreground">
                {place.category_name}
              </AppText>
            </View>
          ) : null}
          <View className="flex-row items-center gap-1 rounded-full bg-muted px-2.5 py-1">
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
          <View className="flex-row items-start gap-1.5">
            <Icon name="location-outline" size={14} tone="muted" />
            <AppText
              className="flex-1 text-[12px] text-muted-foreground"
              numberOfLines={2}
            >
              {address}
            </AppText>
          </View>
        ) : null}

        {/* rating (left) + distance pill (right) — web's bottom row */}
        <View className="flex-row flex-wrap items-center justify-between gap-2 pt-0.5">
          {rating > 0 ? (
            <View className="flex-row items-center gap-1">
              <Stars rating={rating} size={13} />
              <AppText className="text-[12px] text-muted-foreground">
                ({place.review_count ?? 0})
              </AppText>
            </View>
          ) : (
            <AppText className="text-[12px] text-muted-foreground">
              No reviews yet
            </AppText>
          )}
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
