import { FavoriteButton } from "@/components/FavoriteButton";
import { CardImageScrim } from "@/components/cards/CardImageScrim";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import type { PlaceType } from "@abonten/types/placeType";
import { AppText, Icon, Skeleton, Stars } from "@abonten/ui-native";
import { shadow } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

// Native PlaceCard. The cover stays image-first — only a favourite toggle
// (top-right) and an optional "Sponsored" pill (top-left) sit over it.
// Everything factual lives in the body, read top-to-bottom as
//   What is this?  ->  Where?  ->  Is it open?  ->  How far?  ->  How good?
//
//   name (16/700)  ·  type (13)  ·  open/closed (14/600, green/red)
//   ·  venue (13)  ·  rating + distance (13)
//
// Edge cases: long name/type/venue clamp to a bounded line count; rating and
// distance each render only when actually available (no "0.0" / placeholder).

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
  const [imageFailed, setImageFailed] = useState(false);

  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 480,
          height: 320,
        })
      : null;
  const showImage = cover != null && !imageFailed;

  // Same derivation as the web PlaceCard / PlaceOpenStatusBadge:
  // temporary_status wins over the SQL-computed is_open boolean.
  const openStatus = derivePlaceCardOpenStatus(
    place.is_open,
    place.temporary_status ?? null,
  );
  const address = addressText(place.address);
  const rating = place.avg_rating ?? 0;
  const hasRating = rating > 0;
  const hasDistance = typeof place.distance_km === "number";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      className="overflow-hidden rounded-2xl border border-border bg-card active:opacity-95"
      style={shadow.card}
      onPress={() => router.push(`/(app)/place/${place.id}`)}
    >
      <View className="relative aspect-[3/2] bg-muted">
        {showImage ? (
          <Image
            source={{ uri: cover }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
            recyclingKey={place.id}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="image-outline" size={26} tone="muted" />
          </View>
        )}

        <CardImageScrim />

        {sponsored ? (
          <View
            className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: "rgba(17,24,32,0.72)" }}
          >
            <AppText className="text-[11px] font-semibold text-white">
              Sponsored
            </AppText>
          </View>
        ) : null}

        <View className="absolute right-2.5 top-2.5">
          <FavoriteButton kind="place" id={place.id} onSurface size={20} />
        </View>
      </View>

      <View className="gap-2 p-4">
        <View className="flex-row items-start gap-1.5">
          <AppText variant="cardTitle" numberOfLines={2} className="flex-1">
            {place.name}
          </AppText>
          {place.verified ? (
            <Icon
              name="checkmark-circle"
              size={16}
              tone="primary"
              style={{ marginTop: 2 }}
            />
          ) : null}
        </View>

        {place.category_name ? (
          <AppText variant="meta" numberOfLines={1}>
            {place.category_name}
          </AppText>
        ) : null}

        <View className="flex-row items-center gap-1.5">
          <View
            className={`h-2 w-2 rounded-full ${
              openStatus.isOpen ? "bg-success" : "bg-destructive"
            }`}
          />
          <AppText
            variant="metaStrong"
            tone={openStatus.isOpen ? "success" : "error"}
            numberOfLines={1}
          >
            {openStatus.label}
          </AppText>
        </View>

        {address ? (
          <View className="flex-row items-center gap-1.5">
            <Icon name="location-outline" size={14} tone="muted" />
            <AppText variant="meta" className="flex-1" numberOfLines={1}>
              {address}
            </AppText>
          </View>
        ) : null}

        {hasRating || hasDistance ? (
          <View className="flex-row items-center gap-2">
            {hasRating ? (
              <View className="flex-row items-center gap-1">
                <Stars rating={rating} size={13} />
                <AppText variant="metaStrong">{rating.toFixed(1)}</AppText>
                <AppText variant="meta">({place.review_count ?? 0})</AppText>
              </View>
            ) : null}
            {hasRating && hasDistance ? (
              <AppText variant="meta">·</AppText>
            ) : null}
            {hasDistance ? (
              <View className="flex-row items-center gap-1">
                <Icon name="navigate-outline" size={13} tone="muted" />
                <AppText variant="meta">
                  {(place.distance_km as number).toFixed(1)} km
                </AppText>
              </View>
            ) : null}
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
      <View className="gap-2 p-4">
        <Skeleton width="65%" height={16} />
        <Skeleton width="40%" height={13} />
        <Skeleton width="35%" height={14} />
        <Skeleton width="70%" height={13} />
      </View>
    </View>
  );
}
