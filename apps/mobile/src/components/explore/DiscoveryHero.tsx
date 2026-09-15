import { FeaturedBannerCarousel } from "@/components/explore/FeaturedBannerCarousel";
import { FeaturedEventBanner } from "@/components/explore/FeaturedEventBanner";
import { FeaturedPlaceBanner } from "@/components/explore/FeaturedPlaceBanner";
import { WeeklyTeaserCard } from "@/components/weekly/WeeklyTeaserCard";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useWeeklyProgram, useWeeklyTeaser } from "@/features/weekly/useWeekly";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { SectionTitle, Skeleton } from "@abonten/ui-native";
import { View, useWindowDimensions } from "react-native";

// The ONE promotional slot at the top of Explore.
//
// Three kinds of top-of-feed content compete for attention here: the
// editorial Abonten Weekly edition, paid Featured events and paid Featured
// places. Stacking a 380–480px Weekly banner over a 250px Featured banner
// gave two full-bleed heroes with two auto-rotations and two sets of
// progress dots on one screen, and the first card of real content sat a
// full screen-height down. This component decides, per tab, what holds the
// hero:
//
//   • Weekly is out for this area → the Weekly banner is the hero, and the
//     tab's Featured listings follow as a compact peeking row under a
//     "Featured" title (still the banner design with its ad-disclosure
//     pill, but demoted: narrower cards, no autoplay, no dots).
//   • No Weekly edition → the Featured carousel takes the hero slot at
//     full size, exactly as before.
//
// Featured content is independent of the filter sheet: it is a paid
// placement, not a search result, so a filter that matches nothing must
// not remove it. And the slot reserves its height while the Weekly teaser
// is still loading, so the feed does not jump when the banner lands.

const COMPACT_HEIGHT = 196;

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
  const { location } = useExploreLocation();
  const { program } = useWeeklyProgram();
  const teaserQ = useWeeklyTeaser(
    location ? { lat: location.lat, lng: location.lng } : null,
    program.teaser && !!location,
  );
  const weeklyPending = program.teaser && !!location && teaserQ.isPending;
  const weeklyOut = program.teaser && !!teaserQ.data;

  const featured =
    tab === "events" ? (
      <FeaturedBannerCarousel
        items={featuredEvents}
        keyExtractor={(e) => e.id}
        compact={weeklyOut}
        renderItem={(e) => (
          <FeaturedEventBanner
            event={e}
            height={weeklyOut ? COMPACT_HEIGHT : undefined}
          />
        )}
      />
    ) : (
      <FeaturedBannerCarousel
        items={featuredPlaces}
        keyExtractor={(p) => p.id}
        compact={weeklyOut}
        renderItem={(p) => (
          <FeaturedPlaceBanner
            place={p}
            height={weeklyOut ? COMPACT_HEIGHT : undefined}
          />
        )}
      />
    );
  const hasFeatured =
    tab === "events" ? featuredEvents.length > 0 : featuredPlaces.length > 0;

  if (weeklyPending) {
    // Same footprint the Weekly banner will take (see WeeklyTeaserCard's
    // height rule), so the rest of the feed does not move when it arrives.
    const height = Math.round(Math.min(Math.max(width * 1.02, 380), 480));
    return (
      <View className="mb-2 mt-3 px-4">
        <Skeleton height={height} radius={24} />
      </View>
    );
  }

  if (weeklyOut) {
    return (
      <View>
        <WeeklyTeaserCard />
        {hasFeatured ? (
          <View className="gap-2 pt-3">
            <SectionTitle className="px-4">Featured</SectionTitle>
            {featured}
          </View>
        ) : null}
      </View>
    );
  }

  if (!hasFeatured) return null;
  return (
    <View className="gap-2 pt-4">
      <SectionTitle className="px-4">Featured</SectionTitle>
      {featured}
    </View>
  );
}
