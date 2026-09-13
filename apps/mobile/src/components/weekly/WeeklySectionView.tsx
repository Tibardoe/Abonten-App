import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { weeklyParagraphs } from "@abonten/core/weekly/editorialText";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import type { WeeklyItem, WeeklySection } from "@abonten/types/weeklyType";
import { AppText, Icon, PressableScale } from "@abonten/ui-native";
import { shadow, useCarouselCardWidth } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FlatList, View } from "react-native";

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

function HeroItem({ item }: { item: WeeklyItem }) {
  const router = useRouter();
  const event = item.event;
  const place = item.place;
  if (!event && !place) return null;
  const title = event ? event.title : (place?.name ?? "");
  const imageId = event ? event.flyer_public_id : place?.cover_public_id;
  const imageVersion = event ? event.flyer_version : place?.cover_version;
  const detail = event
    ? getEventCardDateTime(event.starts_at, event.ends_at, event.occurrences)
    : [
        place?.category_name,
        place?.avg_rating ? `${Number(place.avg_rating).toFixed(1)} ★` : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const open = () =>
    router.push(
      event ? `/(app)/event/${event.id}` : `/(app)/place/${place?.id}`,
    );

  return (
    <PressableScale
      onPress={open}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${event ? "Open event" : "Open place"}: ${title}`}
      style={shadow.card}
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <View style={{ aspectRatio: 16 / 10 }} className="w-full bg-muted">
        {imageId ? (
          <Image
            source={{
              uri: buildCloudinaryUrl(imageId, imageVersion ?? undefined, {
                width: 640,
                height: 400,
              }),
            }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="image-outline" size={28} tone="muted" />
          </View>
        )}
      </View>
      <View className="gap-1 p-4">
        {item.headline ? (
          <AppText variant="overline" tone="brand" numberOfLines={1}>
            {item.headline}
          </AppText>
        ) : null}
        <AppText variant="screenTitle" numberOfLines={2}>
          {title}
        </AppText>
        {detail ? (
          <AppText variant="metaStrong" numberOfLines={1}>
            {typeof detail === "string"
              ? detail
              : `${detail.date} · ${detail.time}`}
          </AppText>
        ) : null}
        {item.blurb ? (
          <AppText variant="body" numberOfLines={3} className="mt-1">
            {item.blurb}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
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
