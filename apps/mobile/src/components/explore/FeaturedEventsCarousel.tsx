import type { UserPostType } from "@abonten/types/postsType";
import { FeaturedBannerCarousel } from "./FeaturedBannerCarousel";
import { FeaturedEventBanner } from "./FeaturedEventBanner";

// Native echo of the web FeaturedEventsCarousel — the Featured (paid-
// promotion) events hero row at the top of Explore → Events. `events` is
// already eligibility-filtered/ordered by getFeaturedEvents() upstream.
export function FeaturedEventsCarousel({ events }: { events: UserPostType[] }) {
  return (
    <FeaturedBannerCarousel
      items={events}
      keyExtractor={(e) => e.id}
      renderItem={(e) => <FeaturedEventBanner event={e} />}
    />
  );
}
