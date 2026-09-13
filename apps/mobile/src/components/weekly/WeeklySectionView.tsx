import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { hapticLight } from "@/lib/haptics";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import { weeklyParagraphs } from "@abonten/core/weekly/editorialText";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import type { WeeklyItem, WeeklySection } from "@abonten/types/weeklyType";
import { AppText, Icon, PressableScale } from "@abonten/ui-native";
import {
  shadow,
  useCarouselCardWidth,
  useThemeColors,
} from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { FlatList, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// One Abonten Weekly section, laid out the way the editor chose. Listings use
// the app's own EventCard and PlaceCard, so save, share, "You're going" and
// the cancelled / sold-out / ended states behave exactly as on Explore.

function Headline({
  text,
  reserve,
}: { text: string | null; reserve: boolean }) {
  if (!text && !reserve) return null;
  return (
    <AppText
      variant="overline"
      tone="brand"
      numberOfLines={1}
      className="min-h-[16px]"
      accessibilityElementsHidden={!text}
      importantForAccessibility={text ? "auto" : "no-hide-descendants"}
    >
      {text ?? ""}
    </AppText>
  );
}

function ItemFrame({
  item,
  reserveHeadline,
}: { item: WeeklyItem; reserveHeadline: boolean }) {
  const card = item.event ? (
    <EventCard event={item.event} />
  ) : item.place ? (
    <PlaceCard place={item.place} />
  ) : null;
  if (!card) return null;
  return (
    <View className="gap-1.5">
      <Headline text={item.headline} reserve={reserveHeadline} />
      {card}
      {item.blurb ? (
        <AppText variant="muted" numberOfLines={3} className="px-1">
          {item.blurb}
        </AppText>
      ) : null}
    </View>
  );
}

const WHITE_72 = "rgba(255,255,255,0.72)";
const WHITE_85 = "rgba(255,255,255,0.85)";

// The listing a "hero" section gives the most room: its photo fills the card
// and the text sits over it, like the banner at the top of the screen.
function HeroItem({ item }: { item: WeeklyItem }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [imageFailed, setImageFailed] = useState(false);
  const event = item.event;
  const place = item.place;
  if (!event && !place) return null;
  const title = event ? event.title : (place?.name ?? "");
  const imageId = event ? event.flyer_public_id : place?.cover_public_id;
  const imageVersion = event ? event.flyer_version : place?.cover_version;
  const when = event
    ? getEventCardDateTime(event.starts_at, event.ends_at, event.occurrences)
    : null;
  const kicker = event
    ? (event.event_category ?? "Event")
    : place?.category_name;
  const rating =
    place?.avg_rating != null && Number(place.avg_rating) > 0
      ? `${Number(place.avg_rating).toFixed(1)} · ${place.review_count} review${place.review_count === 1 ? "" : "s"}`
      : null;
  const address = (
    (event?.address ?? place?.address) as { full_address?: string } | undefined
  )?.full_address;
  const price = event
    ? event.min_price === 0 || event.min_price == null
      ? "Free entry"
      : `From ${event.currency ?? "GHS"} ${Number(event.min_price).toLocaleString()}`
    : null;
  const status = event
    ? event.status === "canceled"
      ? "Event cancelled"
      : getEventStatusOverlay(event.starts_at, event.ends_at, event.occurrences)
    : place?.temporary_status === "temporarily_closed"
      ? "Temporarily closed"
      : null;
  const height = Math.round(Math.min(Math.max(width * 1.1, 400), 520));
  const open = () => {
    hapticLight();
    router.push(
      event ? `/(app)/event/${event.id}` : `/(app)/place/${place?.id}`,
    );
  };

  return (
    <PressableScale
      onPress={open}
      activeScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${event ? "Open event" : "Open place"}: ${title}`}
      style={[shadow.card, { height }]}
      className="overflow-hidden rounded-3xl bg-slate-950"
    >
      {imageId && !imageFailed ? (
        <Image
          source={{
            uri: buildCloudinaryUrl(imageId, imageVersion ?? undefined, {
              width: 540,
            }),
          }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          accessibilityIgnoresInvertColors
          onError={() => setImageFailed(true)}
        />
      ) : (
        <HeroBrandBackdrop />
      )}
      <HeroScrim />

      <View className="flex-1 justify-between p-5">
        <View className="flex-row flex-wrap gap-2">
          {item.headline ? (
            <View className="rounded-full bg-primary px-3 py-1.5">
              <AppText
                className="text-[11px] font-bold uppercase tracking-widest text-primary-foreground"
                numberOfLines={1}
              >
                {item.headline}
              </AppText>
            </View>
          ) : null}
          {status ? (
            <View
              className="rounded-full px-3 py-1.5"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              <AppText className="text-[11px] font-medium text-white">
                {status}
              </AppText>
            </View>
          ) : null}
        </View>

        <View>
          {kicker ? (
            <AppText
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: WHITE_72 }}
              numberOfLines={1}
            >
              {kicker}
            </AppText>
          ) : null}
          <AppText
            className="mt-1 text-[28px] font-extrabold leading-[31px] text-white"
            numberOfLines={3}
          >
            {title}
          </AppText>
          <View className="mt-2 gap-1">
            {when ? (
              <MetaLine icon="calendar-outline">
                {[when.date, when.time].filter(Boolean).join(" · ")}
                {when.extraDates > 0 ? ` +${when.extraDates} more` : ""}
              </MetaLine>
            ) : null}
            {rating ? <MetaLine icon="star">{rating}</MetaLine> : null}
            {address ? (
              <MetaLine icon="location-outline">{address}</MetaLine>
            ) : null}
          </View>
          {item.blurb ? (
            <AppText
              className="mt-2 text-[14px] leading-[20px]"
              style={{ color: WHITE_85 }}
              numberOfLines={3}
            >
              {item.blurb}
            </AppText>
          ) : null}
          <View className="mt-4 flex-row flex-wrap items-center gap-2">
            <View className="flex-row items-center gap-2.5 rounded-full bg-white py-1.5 pl-4 pr-1.5">
              <AppText className="text-[14px] font-semibold text-slate-950">
                {event ? "View event" : "View place"}
              </AppText>
              <View className="h-7 w-7 items-center justify-center rounded-full bg-slate-950">
                <Icon name="arrow-forward" size={15} color="#fff" />
              </View>
            </View>
            {price ? (
              <View
                className="rounded-full px-3.5 py-2"
                style={{
                  backgroundColor: "rgba(255,255,255,0.16)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.22)",
                }}
              >
                <AppText className="text-[13px] font-semibold text-white">
                  {price}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

function MetaLine({
  icon,
  children,
}: {
  icon: "calendar-outline" | "star" | "location-outline";
  children: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon
        name={icon}
        size={14}
        color={icon === "star" ? "#fbbf24" : WHITE_85}
      />
      <AppText
        className="flex-1 text-[13px]"
        style={{ color: WHITE_85 }}
        numberOfLines={1}
      >
        {children}
      </AppText>
    </View>
  );
}

// Shown when a listing has no photo or it fails to load.
function HeroBrandBackdrop() {
  const c = useThemeColors();
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="weekly-hero-brand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.primary} stopOpacity="1" />
          <Stop offset="0.55" stopColor="#115e59" stopOpacity="1" />
          <Stop offset="1" stopColor="#05080d" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#weekly-hero-brand)"
      />
    </Svg>
  );
}

function HeroScrim() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="weekly-hero-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#05080d" stopOpacity="0.45" />
          <Stop offset="0.25" stopColor="#05080d" stopOpacity="0.1" />
          <Stop offset="0.45" stopColor="#05080d" stopOpacity="0.55" />
          <Stop offset="0.7" stopColor="#05080d" stopOpacity="0.84" />
          <Stop offset="1" stopColor="#05080d" stopOpacity="0.95" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#weekly-hero-scrim)"
      />
    </Svg>
  );
}

function ListRow({ item }: { item: WeeklyItem }) {
  const router = useRouter();
  const event = item.event;
  const place = item.place;
  if (!event && !place) return null;
  const title = event ? event.title : (place?.name ?? "");
  const imageId = event ? event.flyer_public_id : place?.cover_public_id;
  const imageVersion = event ? event.flyer_version : place?.cover_version;
  const meta = event ? event.address?.full_address : place?.category_name;
  return (
    <PressableScale
      onPress={() =>
        router.push(
          event ? `/(app)/event/${event.id}` : `/(app)/place/${place?.id}`,
        )
      }
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row gap-3 rounded-2xl border border-border bg-card p-3"
    >
      <View className="h-[76px] w-[76px] overflow-hidden rounded-xl bg-muted">
        {imageId ? (
          <Image
            source={{
              uri: buildCloudinaryUrl(imageId, imageVersion ?? undefined, {
                width: 96,
                height: 96,
              }),
            }}
            style={{ width: 76, height: 76 }}
            contentFit="cover"
          />
        ) : null}
      </View>
      <View className="flex-1 justify-center gap-0.5">
        {item.headline ? (
          <AppText variant="overline" tone="brand" numberOfLines={1}>
            {item.headline}
          </AppText>
        ) : null}
        <AppText variant="bodyStrong" numberOfLines={2}>
          {title}
        </AppText>
        {meta ? (
          <AppText variant="meta" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function WeeklySectionView({ section }: { section: WeeklySection }) {
  const cardWidth = useCarouselCardWidth();
  const icon = weeklySectionIcon(section.iconKey);
  const reserveHeadline = section.items.some((i) => !!i.headline);

  const header = (
    <View className="gap-0.5 px-4">
      <AppText variant="sectionTitle" accessibilityRole="header">
        {icon ? `${icon} ` : ""}
        {section.title}
      </AppText>
      {section.subtitle ? (
        <AppText variant="muted">{section.subtitle}</AppText>
      ) : null}
    </View>
  );

  if (section.layout === "editorial" || section.kind === "editorial") {
    return (
      <View className="mx-4 gap-2 rounded-2xl border border-border bg-card p-4">
        <AppText variant="sectionHeading" accessibilityRole="header">
          {icon ? `${icon} ` : ""}
          {section.title}
        </AppText>
        {weeklyParagraphs(section.body).map((p) => (
          <AppText key={p} variant="bodyLg">
            {p}
          </AppText>
        ))}
      </View>
    );
  }

  if (section.items.length === 0) return null;

  if (section.layout === "carousel") {
    return (
      <View className="gap-2">
        {header}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={section.items}
          keyExtractor={(i) => i.id}
          contentContainerClassName="gap-3 px-4"
          accessibilityLabel={section.title}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <ItemFrame item={item} reserveHeadline={reserveHeadline} />
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View className="gap-2">
      {header}
      <View className="gap-3 px-4">
        {section.items.map((item) =>
          section.layout === "hero" ? (
            <HeroItem key={item.id} item={item} />
          ) : section.layout === "list" ? (
            <ListRow key={item.id} item={item} />
          ) : (
            <ItemFrame key={item.id} item={item} reserveHeadline={false} />
          ),
        )}
      </View>
    </View>
  );
}
