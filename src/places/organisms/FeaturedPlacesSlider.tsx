"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import type { PlaceType } from "@/types/placeType";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";
import PlaceCard from "../molecules/PlaceCard";
import SponsoredBadge from "../molecules/SponsoredBadge";

type FeaturedPlacesSliderProps = {
  places: PlaceType[];
};

// "Featured Places" section (Places Phase 2, Milestone 5, paid promotion).
// Not a reuse of PlacesSlider.tsx (checked first, per the task) -- its shape
// doesn't fit, since every card here also needs a "Sponsored" badge overlay
// and a once-per-card impression log, neither of which PlacesSlider
// supports. PlaceCard.tsx itself is reused completely unmodified, per spec:
// its own <li> root is wrapped in a plain <div> (not nested inside another
// <li>/<ul>) purely so the badge can be absolutely positioned over it.
export default function FeaturedPlacesSlider({
  places,
}: FeaturedPlacesSliderProps) {
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loggedImpressions = useRef<Set<string>>(new Set());

  const checkScrollPosition = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    const currentRef = scrollRef.current;
    if (currentRef) {
      currentRef.addEventListener("scroll", checkScrollPosition);
      checkScrollPosition();
    }
    return () => {
      if (currentRef) {
        currentRef.removeEventListener("scroll", checkScrollPosition);
      }
    };
  }, [checkScrollPosition]);

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

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.75;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (places.length === 0) return null;

  return (
    <div>
      <h2 className="font-medium text-lg mb-1">Featured Places</h2>

      <div className="relative">
        {showLeftArrow && (
          <button
            type="button"
            onClick={() => scroll("left")}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-popover/90 backdrop-blur-sm p-3 rounded-full shadow-md hover:bg-popover transition-all hover:scale-110"
            aria-label="Scroll left"
          >
            <FaArrowLeftLong className="text-xl text-popover-foreground" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[90%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%] gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3"
        >
          {places.map((place, index) => (
            <div key={place.id} className="relative">
              <SponsoredBadge className="absolute left-3 top-3 z-10" />
              <PlaceCard priority={index < 4} {...place} />
            </div>
          ))}
        </div>

        {showRightArrow && (
          <button
            type="button"
            onClick={() => scroll("right")}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-popover/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-popover transition-all hover:scale-110"
            aria-label="Scroll right"
          >
            <FaArrowRightLong className="text-xl text-popover-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
