import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import type { UserPostType } from "@abonten/types/postsType";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// Native echo of the web molecules/Banner — the hero treatment for a
// Featured (paid-promotion) event: full-bleed flyer, dark gradient scrim, a
// "Featured" ad-disclosure pill, then title / meta / price / CTA. Rendered
// by FeaturedEventsCarousel at the top of the Explore → Events tab, matching
// the web FeaturedEventsCarousel placement.

// Web molecules/Banner is h-[250px] at mobile widths — the native banner
// matches that so it reads as the page's hero, not just another card.
const BANNER_HEIGHT = 250;
const WHITE_85 = "rgba(255,255,255,0.85)";
const INK = "#0b1220";

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  return `From ${currency} ${price.toLocaleString()}`;
}

function Scrim() {
  return (
    <Svg
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity="0" />
          <Stop offset="0.55" stopColor={INK} stopOpacity="0.45" />
          <Stop offset="1" stopColor={INK} stopOpacity="0.92" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
    </Svg>
  );
}

export function FeaturedEventBanner({ event }: { event: UserPostType }) {
  const router = useRouter();

  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 900,
          height: 420,
        })
      : null;
  const dateTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  const address = event.address?.full_address ?? "Venue TBA";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Featured event: ${event.title}`}
      onPress={() => router.push(`/(app)/event/${event.id}`)}
      className="overflow-hidden rounded-2xl bg-muted active:opacity-95"
      style={{ height: BANNER_HEIGHT }}
    >
      {flyer ? (
        <Image
          source={{ uri: flyer }}
          style={{ position: "absolute", width: "100%", height: "100%" }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <Scrim />

      {/* Ad-disclosure pill — brand mint, never the rating colour. */}
      <View className="absolute right-3 top-3 flex-row items-center gap-1 rounded-full bg-mint px-2.5 py-1">
        <Icon name="megaphone" size={12} color={INK} />
        <AppText
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color: INK }}
        >
          Featured
        </AppText>
      </View>

      <View className="absolute inset-x-0 bottom-0 gap-2 p-4">
        {/* Web Banner's "Most Anticipated" tag above the title. */}
        <View
          className="self-start rounded-full px-2.5 py-1"
          style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
        >
          <AppText className="text-[11px] font-medium text-white">
            Most Anticipated
          </AppText>
        </View>

        <AppText
          className="text-[17px] font-bold leading-[22px] text-white"
          numberOfLines={2}
        >
          {event.title}
        </AppText>

        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <View className="flex-row items-center gap-1">
            <Icon name="location-outline" size={13} color={WHITE_85} />
            <AppText
              className="max-w-[180px] text-[12px]"
              style={{ color: WHITE_85 }}
              numberOfLines={1}
            >
              {address}
            </AppText>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon name="calendar-outline" size={13} color={WHITE_85} />
            <AppText className="text-[12px]" style={{ color: WHITE_85 }}>
              {dateTime?.date ?? "Date TBA"}
            </AppText>
          </View>
          {dateTime?.time ? (
            <View className="flex-row items-center gap-1">
              <Icon name="time-outline" size={13} color={WHITE_85} />
              <AppText className="text-[12px]" style={{ color: WHITE_85 }}>
                {dateTime.time}
              </AppText>
            </View>
          ) : null}
        </View>

        <View className="mt-1 flex-row items-center justify-between gap-2">
          <View
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <AppText className="text-[12px] font-semibold text-white">
              {priceLabel(event)}
            </AppText>
          </View>
          <View className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5">
            <AppText className="text-[13px] font-semibold text-primary-foreground">
              View details
            </AppText>
            <Icon name="arrow-forward" size={13} tone="inverse" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
