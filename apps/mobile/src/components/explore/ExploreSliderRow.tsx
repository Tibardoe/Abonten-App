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

const CARD_WIDTH = 260;

export function EventSliderRow({
  title,
  events,
  featured = false,
}: {
  title: string;
  events: UserPostType[];
  featured?: boolean;
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
          <View style={{ width: featured ? CARD_WIDTH + 40 : CARD_WIDTH }}>
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
}: {
  title: string;
  places: PlaceType[];
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
            <PlaceCard place={item} />
          </View>
        )}
      />
    </View>
  );
}
