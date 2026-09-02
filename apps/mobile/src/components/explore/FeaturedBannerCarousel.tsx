import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";

// Shared paged banner carousel for the Featured Events / Featured Places
// hero rows — the native echo of the web FeaturedEventsCarousel /
// FeaturedPlacesSlider: nothing for zero items, a single static banner for
// one, and for several a full-width paged strip that auto-advances every
// few seconds (paused while the user is dragging, resumed after; disabled
// when the OS "reduce motion" setting is on), with a dot indicator.

const H_PADDING = 16;
const AUTOPLAY_MS = 4500;

export function FeaturedBannerCarousel<T>({
  items,
  keyExtractor,
  renderItem,
}: {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = width - H_PADDING * 2;
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotionRef.current = v;
    });
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      if (pausedRef.current || reduceMotionRef.current) return;
      const next = (indexRef.current + 1) % items.length;
      indexRef.current = next;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * cardWidth, animated: true });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [items.length, cardWidth]);

  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <View style={{ paddingHorizontal: H_PADDING }} className="pt-1">
        {renderItem(items[0])}
      </View>
    );
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    indexRef.current = next;
    setIndex(next);
    pausedRef.current = false;
  }

  return (
    <View className="pt-1">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: H_PADDING }}
        onScrollBeginDrag={() => {
          pausedRef.current = true;
        }}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {items.map((item) => (
          <View key={keyExtractor(item)} style={{ width: cardWidth }}>
            {renderItem(item)}
          </View>
        ))}
      </ScrollView>

      <View className="mt-2 flex-row justify-center gap-1.5">
        {items.map((item, i) => (
          <View
            key={keyExtractor(item)}
            className={`h-1.5 rounded-full ${
              i === index ? "w-4 bg-primary" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </View>
    </View>
  );
}
