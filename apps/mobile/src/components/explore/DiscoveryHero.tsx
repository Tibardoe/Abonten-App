import {
  EventSpotlightCard,
  PlaceSpotlightCard,
  WeeklySpotlightCard,
} from "@/components/explore/spotlight/SpotlightCards";
import { SpotlightCarousel } from "@/components/explore/spotlight/SpotlightCarousel";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { logPlacePromotionImpression } from "@/features/places/placeEngagement";
import { useWeeklyProgram, useWeeklyTeaser } from "@/features/weekly/useWeekly";
import {
  buildSpotlightSlides,
  spotlightHeight,
} from "@abonten/core/discovery/spotlight";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { Skeleton } from "@abonten/ui-native";
import { useCallback, useMemo, useRef } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

// The ONE promotional slot at the top of Explore: the Spotlight.
//
// It used to be two heroes — a 380–480px Abonten Weekly banner and, under
// it, the Featured listings demoted to a 196px peeking row (too small for
// content businesses pay to promote), each with its own rotation and its own
// indicator. Now the Weekly edition and the tab's Featured listings are
// slides of a single carousel: one height, one indicator, one rotation, and
// every paid slide full size with its disclosure pill. Which slides appear,
// in what order and how many is decided by @abonten/core/discovery/spotlight.
//
// Featured content is independent of the filter sheet: it is a paid
// placement, not a search result, so a filter that matches nothing must not
// remove it. While the Weekly teaser is still loading the slot reserves its
// height, so the feed does not jump when the edition lands.

export function DiscoveryHero({
  tab,
  featuredEvents,
  featuredPlaces,
}: {
  tab: "events" | "places";
  featuredEvents: UserPostType[];
  featuredPlaces: PlaceType[];
}) {
  const { width } = useWindowDimensions();
  const height = spotlightHeight(width);
  const { location } = useExploreLocation();
  const { program } = useWeeklyProgram();
  const teaserQ = useWeeklyTeaser(
    location ? { lat: location.lat, lng: location.lng } : null,
    program.teaser && !!location,
  );
  const weeklyPending = program.teaser && !!location && teaserQ.isPending;
  const weekly = program.teaser ? (teaserQ.data ?? null) : null;

  const slides = useMemo(
    () =>
      buildSpotlightSlides({
        tab,
        weekly,
        featuredEvents,
        featuredPlaces,
      }),
    [tab, weekly, featuredEvents, featuredPlaces],
  );

  // A sponsored place counts one impression when its slide is actually on
  // screen (not merely loaded into the carousel), once per mount.
  const counted = useRef(new Set<string>());
  const onSlideVisible = useCallback((slide: (typeof slides)[number]) => {
    if (slide.kind !== "place" || counted.current.has(slide.place.id)) return;
    counted.current.add(slide.place.id);
    logPlacePromotionImpression(slide.place.id);
  }, []);

  if (weeklyPending) {
    return (
      <View className="px-4">
        <Skeleton height={height} radius={24} />
      </View>
    );
  }

  if (slides.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <SpotlightCarousel
        // A new tab is a new set of slides: start from the first one.
        key={tab}
        slides={slides}
        height={height}
        onSlideVisible={onSlideVisible}
        renderSlide={(slide, { index, count }) =>
          slide.kind === "weekly" ? (
            <WeeklySpotlightCard
              teaser={slide.weekly}
              index={index}
              count={count}
            />
          ) : slide.kind === "event" ? (
            <EventSpotlightCard
              event={slide.event}
              index={index}
              count={count}
            />
          ) : (
            <PlaceSpotlightCard
              place={slide.place}
              index={index}
              count={count}
            />
          )
        }
      />
    </Animated.View>
  );
}
