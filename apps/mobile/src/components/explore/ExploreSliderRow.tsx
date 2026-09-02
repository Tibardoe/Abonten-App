import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { SectionTitle } from "@abonten/ui-native";
import { FlatList, View } from "react-native";

// Native echo of the web EventsSlider / PlacesSlider — a titled horizontal
// strip of cards above the filterable "All" list. The web sliders also
// carry a "see all" link to a dedicated window page
// (/explore/.../happening-today etc.); those routes don't exist on mobile
// yet, so the heading is not yet linked (tracked in docs/mobile/09).
// Featured events get the FeaturedEventsCarousel banner treatment instead
// of this row.

const CARD_WIDTH = 260;

export function EventSliderRow({
  title,
  events,
}: {
  title: string;
  events: UserPostType[];
}) {
  if (events.length === 0) return null;
  return (
    <View className="gap-2 pt-4">
      <SectionTitle className="px-4">{title}</SectionTitle>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item }) => (
          <View style={{ width: CARD_WIDTH }}>
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
}: {
  title: string;
  places: PlaceType[];
  /** Featured (paid-placement) row — cards show a "Sponsored" pill. */
  sponsored?: boolean;
}) {
  if (places.length === 0) return null;
  return (
    <View className="gap-2 pt-4">
      <SectionTitle className="px-4">{title}</SectionTitle>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={places}
        keyExtractor={(p) => p.id}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item }) => (
          <View style={{ width: CARD_WIDTH }}>
            <PlaceCard place={item} sponsored={sponsored} />
          </View>
        )}
      />
    </View>
  );
}
