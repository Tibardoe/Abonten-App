import { FeaturedBanner } from "@/components/explore/FeaturedBanner";
import { WeeklyTeaserCard } from "@/components/weekly/WeeklyTeaserCard";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useWeeklyProgram, useWeeklyTeaser } from "@/features/weekly/useWeekly";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { Skeleton } from "@abonten/ui-native";
import { View, useWindowDimensions } from "react-native";

// The promotional slots at the top of Explore:
//
//   • the Abonten Weekly banner, when this week's edition is out for the
//     area (editorial, rotating through the edition's picks), then
//   • the Featured banner for the current tab — paid events or places shown
//     the same way the Weekly banner shows its picks (FeaturedBanner reuses
//     WeeklyBanner), full size with its disclosure.
//
// Featured content is independent of the filter sheet: it is a paid
// placement, not a search result, so a filter that matches nothing must not
// remove it. The Weekly slot reserves its height while the teaser is still
// loading, so the feed does not jump when the banner lands.

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

  return (
    <View>
      {weeklyPending ? (
        // Same footprint the Weekly banner will take (see WeeklyTeaserCard's
        // height rule), so the rest of the feed does not move when it lands.
        <View className="mb-2 mt-3 px-4">
          <Skeleton
            height={Math.round(Math.min(Math.max(width * 1.02, 380), 480))}
            radius={24}
          />
        </View>
      ) : (
        <WeeklyTeaserCard />
      )}

      <FeaturedBanner
        // A new tab is a new set of listings: start from the first one.
        key={tab}
        kind={tab}
        events={featuredEvents}
        places={featuredPlaces}
      />
    </View>
  );
}
