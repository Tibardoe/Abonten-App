import type { UserPostType } from "@abonten/types/postsType";
import { useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { FeaturedEventBanner } from "./FeaturedEventBanner";

// Native echo of the web FeaturedEventsCarousel: nothing for zero featured
// events, a single static banner for one, and a horizontally-paged strip
// with dots for several. `events` is already eligibility-filtered/ordered by
// getFeaturedEvents() upstream — this only decides how to present it.

const H_PADDING = 16;

export function FeaturedEventsCarousel({ events }: { events: UserPostType[] }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const cardWidth = width - H_PADDING * 2;
  const lastIndex = useRef(0);

  if (events.length === 0) return null;

  if (events.length === 1) {
    return (
      <View style={{ paddingHorizontal: H_PADDING }} className="pt-1">
        <FeaturedEventBanner event={events[0]} />
      </View>
    );
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    if (next !== lastIndex.current) {
      lastIndex.current = next;
      setIndex(next);
    }
  }

  return (
    <View className="pt-1">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: H_PADDING }}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {events.map((event) => (
          <View key={event.id} style={{ width: cardWidth }}>
            <FeaturedEventBanner event={event} />
          </View>
        ))}
      </ScrollView>

      <View className="mt-2 flex-row justify-center gap-1.5">
        {events.map((event, i) => (
          <View
            key={event.id}
            className={`h-1.5 rounded-full ${
              i === index ? "w-4 bg-primary" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </View>
    </View>
  );
}
