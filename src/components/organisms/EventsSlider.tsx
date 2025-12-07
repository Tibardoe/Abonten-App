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
      ? `/events/location/${location}/explore/similar-events?category=${generateSlug(
          eventCategory,
        )}`
      : "#";

  return (
    <div>
      <div className="flex justify-between font-bold text-lg">
        <h2>{heading}</h2>

        {events.length > 0 && (
          <Link
            href={viewAllLink}
            className="flex items-center group transition-all"
          >
            <span className="hover:underline">View all</span>
            <MdKeyboardArrowRight className="text-2xl md:text-3xl transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Overlay */}
        {events.length === 0 && (
          <div className="relative w-full h-72 rounded-xl overflow-hidden isolate">
            {/* Dark Background */}
            <div className="absolute inset-0 z-0 bg-black bg-opacity-95" />

            {/* Glowing Animated Blobs */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              {/* <div className="absolute left-10 top-10 w-44 h-44 bg-lime-700 opacity-30 rounded-full blur-3xl animate-floatFast" /> */}
              <div className="absolute right-10 bottom-10 w-36 h-36 bg-emerald-400 opacity-30 rounded-full blur-3xl animate-floatFastReverse" />
              {/* <div className="absolute left-1/3 top-1/2 w-28 h-28 bg-cyan-400 opacity-30 rounded-full blur-3xl animate-floatMid" /> */}
              <div className="absolute left-1/3 top-1/2 w-28 h-28 bg-white opacity-90 rounded-full blur-3xl animate-floatMid" />
            </div>

            {/* Glassy Overlay */}
            <div className="absolute inset-0 z-10 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-inner" />

            {/* Content */}
            <div className="relative z-20 flex flex-col items-center justify-center h-full text-center px-6">
              <h3 className="text-lg md:text-xl font-bold text-white mb-2 drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]">
                No Events in this Category
              </h3>
              <p className="text-sm text-gray-300 max-w-md drop-shadow-[0_0_3px_rgba(255,255,255,0.2)]">
                Looks like there are no events here yet. Check back soon or
                explore other categories!
              </p>
              <Link
                href={`/events/location/${location}`}
                className="mt-4 inline-block bg-white text-black font-medium text-sm px-4 py-2 rounded-md transition-all drop-shadow"
              >
                Browse All Events
              </Link>
            </div>
          </div>
        )}

        {/* slide left button */}
        {showLeftArrow && (
          <button
            type="button"
            onClick={() => scroll("left")}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-md hover:bg-white transition-all hover:scale-110"
            aria-label="Scroll left"
          >
            <FaArrowLeftLong className="text-xl text-gray-700" />
          </button>
        )}

        {/* slider container and element */}
        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[90%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%] gap-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3"
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
