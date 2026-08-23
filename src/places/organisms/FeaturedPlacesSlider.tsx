"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import type { PlaceType } from "@/types/placeType";
import { useEffect, useRef } from "react";
import PlaceCard from "../molecules/PlaceCard";
import SponsoredBadge from "../molecules/SponsoredBadge";

type FeaturedPlacesSliderProps = {
  places: PlaceType[];
};

const AUTOPLAY_DELAY_MS = 4000;

// "Featured Places" section (Places Phase 2, Milestone 5, paid promotion).
// Not a reuse of PlacesSlider.tsx (checked first, per the task) -- its shape
// doesn't fit, since every card here also needs a "Sponsored" badge overlay
// and a once-per-card impression log, neither of which PlacesSlider
// supports. PlaceCard.tsx itself is reused completely unmodified, per spec:
// its own <li> root is wrapped in a plain <div> (not nested inside another
// <li>/<ul>) purely so the badge can be absolutely positioned over it.
//
// Previously a hand-rolled scroll-snap div with manual arrow-visibility
// tracking; now built on the shared Embla carousel primitive so it gets the
// same auto-rotate/loop/reduced-motion behavior as FeaturedEventsCarousel,
// while keeping its own responsive multi-card-per-view sizing (several
// places already fit on screen at once on wider viewports, unlike the
// single-slide Events banner).
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

      <Carousel
        opts={{ loop: true, align: "start" }}
        plugins={[plugin]}
        setApi={setApi}
      >
        <CarouselContent className="-ml-3 pb-3">
          {places.map((place, index) => (
            <CarouselItem
              key={place.id}
              className="relative pl-3 basis-[90%] sm:basis-[45%] md:basis-[35%] lg:basis-[28%] xl:basis-[25%]"
            >
              <SponsoredBadge className="absolute left-3 top-3 z-10" />
              <PlaceCard priority={index < 4} {...place} />
            </CarouselItem>
          ))}
        </CarouselContent>

        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
