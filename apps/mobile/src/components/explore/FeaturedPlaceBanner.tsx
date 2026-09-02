import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { PlaceType } from "@abonten/types/placeType";
import { AppText, Icon, Stars } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// Place counterpart to FeaturedEventBanner — the web molecules/PlaceBanner:
// full-bleed cover, dark scrim, a neutral "Sponsored" ad-disclosure pill,
// then category / name / location / rating / "View place". Rendered by
// FeaturedPlacesCarousel on Explore → Places.

// Kept in step with FeaturedEventBanner (web h-[250px]) so the two banner
// types are the same height inside the shared FeaturedBannerCarousel.
const BANNER_HEIGHT = 250;
const WHITE_85 = "rgba(255,255,255,0.85)";
const INK = "#0b1220";

function addressText(address: PlaceType["address"]): string {
  if (address && typeof address === "object" && "full_address" in address) {
    return String((address as { full_address: string }).full_address ?? "");
  }
  return "";
}

function Scrim() {
  return (
    <Svg
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="place-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity="0" />
          <Stop offset="0.55" stopColor={INK} stopOpacity="0.45" />
          <Stop offset="1" stopColor={INK} stopOpacity="0.92" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#place-scrim)" />
    </Svg>
  );
}

export function FeaturedPlaceBanner({ place }: { place: PlaceType }) {
  const router = useRouter();

  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 900,
          height: 420,
        })
      : null;
  const address = addressText(place.address) || "Location not specified";
  const reviewCount = place.review_count ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Featured place: ${place.name}`}
      onPress={() => router.push(`/(app)/place/${place.id}`)}
      className="overflow-hidden rounded-2xl bg-muted active:opacity-95"
      style={{ height: BANNER_HEIGHT }}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ position: "absolute", width: "100%", height: "100%" }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <Scrim />

      <View
        className="absolute right-3 top-3 rounded-full px-2.5 py-1"
        style={{ backgroundColor: "rgba(17,24,32,0.82)" }}
      >
        <AppText className="text-[10px] font-medium text-white">
          Sponsored
        </AppText>
      </View>

      <View className="absolute inset-x-0 bottom-0 gap-2 p-4">
        {place.category_name ? (
          <View
            className="self-start rounded-full px-2.5 py-1"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <AppText className="text-[11px] font-medium text-white">
              {place.category_name}
            </AppText>
          </View>
        ) : null}

        <AppText
          className="text-[20px] font-bold leading-[26px] text-white"
          numberOfLines={2}
        >
          {place.name}
        </AppText>

        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <View className="flex-row items-center gap-1">
            <Icon name="location-outline" size={13} color={WHITE_85} />
            <AppText
              className="max-w-[200px] text-[12px]"
              style={{ color: WHITE_85 }}
              numberOfLines={1}
            >
              {address}
            </AppText>
          </View>
          {reviewCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <Stars rating={place.avg_rating ?? 0} size={12} />
              <AppText className="text-[12px]" style={{ color: WHITE_85 }}>
                ({reviewCount})
              </AppText>
            </View>
          ) : null}
        </View>

        <View className="mt-1 flex-row">
          <View className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5">
            <AppText className="text-[12px] font-semibold text-primary-foreground">
              View place
            </AppText>
            <Icon name="arrow-forward" size={13} tone="inverse" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
