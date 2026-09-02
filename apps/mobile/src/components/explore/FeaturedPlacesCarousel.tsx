import type { PlaceType } from "@abonten/types/placeType";
import { FeaturedBannerCarousel } from "./FeaturedBannerCarousel";
import { FeaturedPlaceBanner } from "./FeaturedPlaceBanner";

// Native echo of the web FeaturedPlacesSlider — the Featured (paid-promotion)
// places hero row at the top of Explore → Places.
export function FeaturedPlacesCarousel({ places }: { places: PlaceType[] }) {
  return (
    <FeaturedBannerCarousel
      items={places}
      keyExtractor={(p) => p.id}
      renderItem={(p) => <FeaturedPlaceBanner place={p} />}
    />
  );
}
