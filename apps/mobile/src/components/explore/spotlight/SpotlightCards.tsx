import { hapticLight } from "@/lib/haptics";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { resolveEventCategoryLabel } from "@abonten/core/eventCategoryLabels";
import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import type { WeeklyTeaser } from "@abonten/types/weeklyType";
import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// The three Spotlight slide designs — Abonten Weekly edition, Featured event,
// Featured place — built on one frame so the carousel reads as one surface:
// same full-bleed photo, same scrim, same type scale, the same white CTA
// pill in the same place. What differs is the eyebrow and the disclosure:
// paid slides always carry their ad-disclosure pill (events "Featured",
// places "Sponsored", the same words as the web banners); the editorial
// edition carries the Abonten Weekly chip instead.
//
// Text sits on a dark scrim over a photo in BOTH themes, so it is always
// white; the frame's own fill (INK) shows only while the photo loads or when
// a listing has none.

const INK = "#070b10";
const WHITE_85 = "rgba(255,255,255,0.85)";
const GLASS = "rgba(255,255,255,0.16)";
const GLASS_BORDER = "rgba(255,255,255,0.24)";

function Scrim() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="spotlight-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity="0.45" />
          <Stop offset="0.22" stopColor={INK} stopOpacity="0.05" />
          <Stop offset="0.45" stopColor={INK} stopOpacity="0.25" />
          <Stop offset="0.72" stopColor={INK} stopOpacity="0.78" />
          <Stop offset="1" stopColor={INK} stopOpacity="0.95" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#spotlight-scrim)"
      />
    </Svg>
  );
}

function Chip({
  children,
  icon,
  tone = "glass",
}: {
  children: ReactNode;
  icon?: IoniconName;
  tone?: "glass" | "disclosure";
}) {
  const disclosure = tone === "disclosure";
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${
        disclosure ? "bg-mint" : ""
      }`}
      style={
        disclosure
          ? undefined
          : {
              backgroundColor: GLASS,
              borderWidth: 1,
              borderColor: GLASS_BORDER,
            }
      }
    >
      {icon ? (
        <Icon name={icon} size={12} color={disclosure ? INK : "#fff"} />
      ) : null}
      <AppText
        numberOfLines={1}
        className="text-[11px] font-bold uppercase tracking-wide"
        style={{ color: disclosure ? INK : "#fff" }}
      >
        {children}
      </AppText>
    </View>
  );
}

function CtaPill({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-2 self-start rounded-full bg-white py-1.5 pl-4 pr-1.5">
      <AppText className="text-[14px] font-semibold text-slate-950">
        {label}
      </AppText>
      <View className="h-7 w-7 items-center justify-center rounded-full bg-slate-950">
        <Icon name="arrow-forward" size={15} color="#fff" />
      </View>
    </View>
  );
}

function MetaLine({ icon, text }: { icon: IoniconName; text: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={icon} size={14} color={WHITE_85} />
      <AppText
        className="flex-1 text-[13px] leading-[18px]"
        style={{ color: WHITE_85 }}
        numberOfLines={1}
      >
        {text}
      </AppText>
    </View>
  );
}

function SpotlightFrame({
  image,
  accessibilityLabel,
  onPress,
  topLeft,
  topRight,
  children,
}: {
  image: string | null;
  accessibilityLabel: string;
  onPress: () => void;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      className="flex-1 overflow-hidden rounded-3xl active:opacity-95"
      style={{ backgroundColor: INK }}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={image}
          accessible={false}
        />
      ) : (
        <BrandBackdrop />
      )}
      <Scrim />
      <View className="flex-1 justify-between p-5" pointerEvents="none">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 flex-row flex-wrap gap-2">{topLeft}</View>
          {topRight}
        </View>
        <View className="gap-2">{children}</View>
      </View>
    </Pressable>
  );
}

function BrandBackdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="spotlight-brand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0F9D8F" stopOpacity="1" />
          <Stop offset="0.55" stopColor="#115e59" stopOpacity="1" />
          <Stop offset="1" stopColor={INK} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#spotlight-brand)"
      />
    </Svg>
  );
}

function Title({ children }: { children: string }) {
  return (
    <AppText
      className="text-[26px] font-extrabold leading-[31px] text-white"
      numberOfLines={2}
    >
      {children}
    </AppText>
  );
}

function position(index: number, count: number): string {
  return count > 1 ? `, ${index + 1} of ${count}` : "";
}

// ── Abonten Weekly edition ────────────────────────────────────────────

export function WeeklySpotlightCard({
  teaser,
  index,
  count,
}: {
  teaser: WeeklyTeaser;
  index: number;
  count: number;
}) {
  const router = useRouter();
  const area = teaser.isFallbackScope ? "Ghana" : teaser.scopeName;
  const week = formatWeekRange(teaser.weekStart);
  const picks = `${teaser.itemCount} ${teaser.itemCount === 1 ? "pick" : "picks"}`;
  const slides = teaser.slides ?? [];
  const cover = slides[0] ?? null;
  const thumbs = slides.slice(0, 4);

  return (
    <SpotlightFrame
      image={
        cover
          ? buildCloudinaryUrl(cover.publicId, cover.version ?? undefined, {
              width: 900,
            })
          : null
      }
      accessibilityLabel={`${WEEKLY_PRODUCT_NAME} for ${area}: ${teaser.title}, ${week}, ${picks}${position(index, count)}`}
      onPress={() =>
        router.push(`/(app)/weekly/${teaser.scopeSlug}/${teaser.weekStart}`)
      }
      topLeft={
        <Chip icon="sparkles">
          {WEEKLY_PRODUCT_NAME} · {area}
        </Chip>
      }
    >
      <AppText
        className="text-[12px] font-semibold"
        style={{ color: WHITE_85 }}
      >
        {week} · {picks}
      </AppText>
      <Title>{teaser.title}</Title>
      <AppText
        className="text-[14px] leading-[20px]"
        style={{ color: WHITE_85 }}
        numberOfLines={2}
      >
        {teaser.subtitle ?? WEEKLY_TAGLINE}
      </AppText>
      <View className="mt-2 flex-row items-center justify-between gap-3">
        <CtaPill label="See this week's picks" />
        {thumbs.length > 1 ? (
          <View className="flex-row">
            {thumbs.map((s, i) => (
              <View
                key={s.key}
                className="h-9 w-9 overflow-hidden rounded-full border-2"
                style={{
                  borderColor: INK,
                  marginLeft: i === 0 ? 0 : -10,
                  backgroundColor: "#1f2937",
                }}
              >
                <Image
                  source={{
                    uri: buildCloudinaryUrl(
                      s.publicId,
                      s.version ?? undefined,
                      {
                        width: 72,
                        height: 72,
                      },
                    ),
                  }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  accessible={false}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </SpotlightFrame>
  );
}

// ── Featured event ────────────────────────────────────────────────────

function eventPrice(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  return `From ${currency} ${price.toLocaleString()}`;
}

export function EventSpotlightCard({
  event,
  index,
  count,
}: {
  event: UserPostType;
  index: number;
  count: number;
}) {
  const router = useRouter();
  const when = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  const whenText = [when?.date, when?.time].filter(Boolean).join(" · ");
  const venue = event.address?.full_address || "Venue to be announced";
  const price = eventPrice(event);
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 900,
          height: 900,
        })
      : null;

  return (
    <SpotlightFrame
      image={flyer}
      accessibilityLabel={`Featured event, sponsored: ${event.title}. ${whenText || "Date to be announced"}. ${venue}. ${price}${position(index, count)}`}
      onPress={() => router.push(`/(app)/event/${event.id}`)}
      topLeft={
        event.event_category ? (
          <Chip icon="pricetag-outline">
            {resolveEventCategoryLabel(event.event_category)}
          </Chip>
        ) : null
      }
      topRight={
        <Chip icon="megaphone" tone="disclosure">
          Featured
        </Chip>
      }
    >
      <Title>{event.title}</Title>
      <View className="gap-1">
        {whenText ? <MetaLine icon="time-outline" text={whenText} /> : null}
        <MetaLine icon="location-outline" text={venue} />
      </View>
      <View className="mt-2 flex-row items-center justify-between gap-3">
        <CtaPill label="View event" />
        <AppText
          className="shrink text-right text-[15px] font-bold text-white"
          numberOfLines={1}
        >
          {price}
        </AppText>
      </View>
    </SpotlightFrame>
  );
}

// ── Featured place ────────────────────────────────────────────────────

function placeAddress(address: PlaceType["address"]): string {
  if (address && typeof address === "object" && "full_address" in address) {
    return String((address as { full_address: string }).full_address ?? "");
  }
  return "";
}

export function PlaceSpotlightCard({
  place,
  index,
  count,
}: {
  place: PlaceType;
  index: number;
  count: number;
}) {
  const router = useRouter();
  const address = placeAddress(place.address) || "Location not specified";
  const open = derivePlaceCardOpenStatus(
    place.is_open,
    place.temporary_status ?? null,
  );
  const rating = place.avg_rating ?? 0;
  const reviews = place.review_count ?? 0;
  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 900,
          height: 900,
        })
      : null;
  const ratingText =
    reviews > 0
      ? `${rating.toFixed(1)} ★ · ${reviews} ${reviews === 1 ? "review" : "reviews"}`
      : null;

  return (
    <SpotlightFrame
      image={cover}
      accessibilityLabel={`Sponsored place: ${place.name}. ${place.category_name ?? "Place"}, ${open.label}. ${address}${ratingText ? `. Rated ${rating.toFixed(1)} from ${reviews} reviews` : ""}${position(index, count)}`}
      onPress={() => router.push(`/(app)/place/${place.id}`)}
      topLeft={
        place.category_name ? (
          <Chip icon="storefront-outline">{place.category_name}</Chip>
        ) : null
      }
      topRight={
        <Chip icon="megaphone" tone="disclosure">
          Sponsored
        </Chip>
      }
    >
      <Title>{place.name}</Title>
      <View className="gap-1">
        <MetaLine
          icon={open.isOpen ? "time" : "time-outline"}
          text={ratingText ? `${open.label} · ${ratingText}` : open.label}
        />
        <MetaLine icon="location-outline" text={address} />
      </View>
      <View className="mt-2">
        <CtaPill label="View place" />
      </View>
    </SpotlightFrame>
  );
}
