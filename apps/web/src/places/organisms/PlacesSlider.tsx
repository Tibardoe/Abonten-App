"use client";

import type { PlaceType } from "@abonten/types/placeType";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";
import PlaceCard from "../molecules/PlaceCard";

type PlacesSliderProps = {
  heading: string;
  places: PlaceType[];
};

// Lightweight horizontal slider for Places sections on the Explore page —
// mirrors src/components/organisms/EventsSlider.tsx's scroll/arrow
// mechanics, but deliberately simpler: no "view all" link (none of these
// sections — Around You / Open Now / Top Rated — have a dedicated sub-page
// in this milestone) and no empty-state overlay (callers just skip
// rendering this component when `places` is empty).
export default function PlacesSlider({ heading, places }: PlacesSliderProps) {
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollRef = useRef<HTMLUListElement>(null);

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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {heading}
      </h2>

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

        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[90%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%] gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3"
        >
          {places.map((place, index) => (
            <PlaceCard key={place.id} priority={index < 4} {...place} />
          ))}
        </ul>

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
