import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { AppText, Icon, Overline } from "@abonten/ui-native";
import { useCarouselCardWidth } from "@abonten/ui-native/theme";
import { FlatList, Pressable, View } from "react-native";

// Native echo of the web EventsSlider / PlacesSlider — a titled horizontal
// strip of cards above the filterable "All" list, with a "View all" action
// that opens the full window (app/(app)/explore/[type]). Featured events get
// the FeaturedEventsCarousel banner treatment instead of this row.
//
// Header styling matches the web EventsSlider exactly: the title is
// deliberately quieter than the "All events" heading below it — an uppercase,
// tracked, muted-foreground kicker (the `Overline` variant) — and "View all"
// is a brand-primary link with a chevron. Web shows "View all" whenever the
// row has any items (no minimum-count gate).

function Header({
  title,
  onViewAll,
  count,
}: {
  title: string;
  onViewAll?: () => void;
  count: number;
}) {
  return (
    <View className="flex-row items-center justify-between px-4">
      <Overline>{title}</Overline>
      {onViewAll && count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View all ${title}`}
          onPress={onViewAll}
          hitSlop={8}
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <AppText variant="small" tone="brand" className="font-semibold">
            View all
          </AppText>
          <Icon name="chevron-forward" size={16} tone="primary" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EventSliderRow({
  title,
  events,
  onViewAll,
}: {
  title: string;
  events: UserPostType[];
  onViewAll?: () => void;
}) {
  const cardWidth = useCarouselCardWidth();
  if (events.length === 0) return null;
  return (
    <View className="gap-2 pt-4">
      <Header title={title} onViewAll={onViewAll} count={events.length} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <EventCard event={item} />
          </View>
        )}
      />
    </View>
  );
}

export function PlaceSliderRow({
  title,
  places,
  sponsored = false,
  onViewAll,
}: {
  title: string;
  places: PlaceType[];
  /** Featured (paid-placement) row — cards show a "Sponsored" pill. */
  sponsored?: boolean;
  onViewAll?: () => void;
}) {
  const cardWidth = useCarouselCardWidth();
  if (places.length === 0) return null;
  return (
    <View className="gap-2 pt-4">
      <Header title={title} onViewAll={onViewAll} count={places.length} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={places}
        keyExtractor={(p) => p.id}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <PlaceCard place={item} sponsored={sponsored} />
          </View>
        )}
      />
    </View>
  );
}
