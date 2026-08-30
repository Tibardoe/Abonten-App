"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import type { PlaceType } from "@abonten/types/placeType";
import { useEffect, useRef } from "react";
import PlaceBanner from "../molecules/PlaceBanner";

type FeaturedPlacesSliderProps = {
  places: PlaceType[];
};

const AUTOPLAY_DELAY_MS = 4000;

// "Featured Places" section (Places Phase 2, Milestone 5, paid promotion).
// Mirrors FeaturedEventsCarousel.tsx's exact structure so it gets the same
// banner presentation and the same zero/one/many handling: nothing for zero
// places, a plain static PlaceBanner for exactly one (no Carousel/Autoplay
// instantiated at all -- embla-carousel-autoplay's own init() bails out
// early for a single-slide carousel without ever setting its `delay`, so
// calling .play() on it throws; the single-item case simply never reaches
// a Carousel here), and a looping autoplaying carousel only once there's
// genuinely more than one to rotate through.
export default function FeaturedPlacesSlider({
  places,
}: FeaturedPlacesSliderProps) {
  const { plugin, setApi } = useCarouselAutoplay(AUTOPLAY_DELAY_MS);
  const loggedImpressions = useRef<Set<string>>(new Set());

  // Fire-and-forget, once per place id -- mirrors the exact pattern
  // PlaceActionButtons.tsx uses for direction_click/phone_click/etc (never
  // awaited, never blocks rendering). Guarded by a ref (not state) so it
  // never re-fires on a re-render caused by something unrelated.
  useEffect(() => {
    for (const place of places) {
      if (loggedImpressions.current.has(place.id)) continue;
      loggedImpressions.current.add(place.id);
      logPlaceEngagement(place.id, "promotion_impression");
    }
  }, [places]);

  if (places.length === 0) return null;

  return (
    <div>
      <h2 className="font-medium text-lg mb-1">Featured Places</h2>

      {places.length === 1 ? (
        <PlaceBanner place={places[0]} />
      ) : (
        <Carousel
          opts={{ loop: true, align: "start" }}
          plugins={[plugin]}
          setApi={setApi}
          className="w-full"
        >
          <CarouselContent>
            {places.map((place) => (
              <CarouselItem key={place.id}>
                <PlaceBanner place={place} />
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious />
          <CarouselNext />
          <CarouselDots className="mt-3" />
        </Carousel>
      )}
    </div>
  );
}
