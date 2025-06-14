"use client";

import type { UserPostType } from "@/types/postsType";
import { generateSlug } from "@/utils/geerateSlug";
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
      ? `/events/${location}/explore/similar-events?category=${generateSlug(
          eventCategory,
        )}`
      : "#";

  return (
    <div className="space-y-2">
      <div className="flex justify-between font-bold">
        <h2 className="text-primary md:text-lg">{heading}</h2>

        {events.length > 0 && (
          <Link
            href={viewAllLink}
            className="flex items-center gap-1 group transition-all"
          >
            <span className="text-primary md:text-lg font-bold hover:underline">
              View all
            </span>
            <MdKeyboardArrowRight className="text-2xl transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Overlay */}
        {events.length === 0 && (
          <div className="text-gray-200 font-semibold md:text-xl rounded-xl w-full h-56 bg-black bg-opacity-60 flex justify-center items-center">
            Events unavailable in this category
          </div>
        )}

        {/* slide left button */}
        {showLeftArrow && (
          <button
            type="button"
            onClick={() => scroll("left")}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
            aria-label="Scroll left"
          >
            <FaArrowLeftLong className="text-xl text-gray-700" />
          </button>
        )}

        {/* slider container and element */}
        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[80%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%] gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2 py-3"
          // className="grid grid-flow-col auto-cols-[300px] overflow-x-scroll scrollbar-hide gap-2 pb-4 relative"
        >
          {events.map((event) => (
            <EventCard
              key={event.title}
              title={event.title}
              id={event.id}
              flyer_public_id={event.flyer_public_id}
              flyer_version={event.flyer_version}
              address={event.address}
              event_code={event.event_code}
              starts_at={event.starts_at}
              ends_at={event.ends_at}
              event_dates={event.event_dates}
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
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
            aria-label="Scroll right"
          >
            <FaArrowRightLong className="text-xl text-gray-700" />
          </button>
        )}
      </div>
    </div>
  );
}
