"use client";

import { generateSlug } from "@abonten/core/geerateSlug";
import type { UserPostType } from "@abonten/types/postsType";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";
import { MdKeyboardArrowRight } from "react-icons/md";
import EventCard from "../molecules/EventCard";

type EventsSliderProp = {
  heading: string;
  eventCategory?: string;
  urlPath?: string;
  events: UserPostType[];
};

export default function EventsSlider({
  heading,
  events,
  eventCategory,
  urlPath,
}: EventsSliderProp) {
  const [showLeftArrow, setShowLeftArrow] = useState(false);

  const [showRightArrow, setShowRightArrow] = useState(false);

  const scrollRef = useRef<HTMLUListElement>(null);

  const { location } = useParams();

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
      checkScrollPosition(); // Initial check
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

  const viewAllLink = urlPath
    ? `/events/${urlPath}`
    : eventCategory
      ? `/events/location/${location}/explore/similar-events?category=${generateSlug(
          eventCategory,
        )}`
      : "#";

  return (
    <div>
      {/* Deliberately quieter than the "All Events" heading below --
          curated sliders are secondary/glanceable content between the
          Featured carousel (most prominent) and the primary All Events
          listing, not another equally-weighted section (Phase 7: avoid
          every section competing equally). */}
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </h2>

        {events.length > 0 && (
          <Link
            href={viewAllLink}
            className="flex items-center gap-0.5 text-sm font-medium text-primary group transition-all"
          >
            <span className="hover:underline">View all</span>
            <MdKeyboardArrowRight className="text-lg transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Empty state -- a compact inline row rather than a full-height
            decorative block, since several of these windows (Today/This
            Week/This Month) can easily be empty at once for a quiet
            location, and stacking multiple large blocks back-to-back was
            exactly the "competing sections" / "large empty area" problem
            this page needed to avoid. */}
        {events.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              No events in this category yet.
            </p>
            <Link
              href={`/events/location/${location}`}
              className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
            >
              Browse all events
            </Link>
          </div>
        )}

        {/* slide left button */}
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

        {/* slider container and element */}
        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[90%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%] gap-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3"
          // className="grid grid-flow-col auto-cols-[300px] overflow-x-scroll scrollbar-hide gap-2 pb-4 relative"
        >
          {events.map((event, index) => (
            <EventCard
              key={event.title}
              priority={index < 4}
              title={event.title}
              id={event.id}
              flyer_public_id={event.flyer_public_id}
              flyer_version={event.flyer_version}
              address={event.address}
              event_code={event.event_code}
              starts_at={event.starts_at}
              ends_at={event.ends_at}
              occurrences={event.occurrences}
              min_price={event.min_price}
              organizer_id={event.organizer_id}
              currency={event.currency}
              created_at={event.created_at}
              capacity={event.capacity}
              attendanceCount={event.attendanceCount}
              status={event.status}
            />
          ))}
        </ul>

        {/* slide right button */}
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
