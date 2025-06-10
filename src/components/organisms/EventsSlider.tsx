"use client";

import type { UserPostType } from "@/types/postsType";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";
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
  const scrollRef = useRef<HTMLUListElement>(null);

  const { location } = useParams();

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const scrollAmount = 300 * 3;

    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="my-8 space-y-3">
      <div className="flex justify-between font-bold">
        <h2 className="text-xl">{heading}</h2>

        <Link
          href={
            urlPath
              ? `/events/${urlPath}`
              : `/events/${location}/explore/similar-events?category=${
                  eventCategory && generateSlug(eventCategory)
                }`
          }
          className="flex gap-1 items-center font-bold text-xl"
        >
          All
          <Image
            src="/assets/images/arrowRight.svg"
            alt="Arrow right"
            width={30}
            height={30}
          />
        </Link>
      </div>

      <div className="relative">
        {/* Overlay */}
        {events.length === 0 && (
          <div className="text-gray-200 font-semibold md:text-xl rounded-xl w-full h-56 bg-black bg-opacity-60 flex justify-center items-center">
            Events unavailable in this category
          </div>
        )}

        {/* slide left button */}
        {events.length !== 0 && (
          <button
            type="button"
            onClick={() => scroll("left")}
            className="bg-white shadow-xl hidden md:grid place-items-center rounded-full w-10 h-10 absolute top-[50%] -translate-y-[50%]"
          >
            <Image
              src="/assets/images/moveBack.svg"
              alt="Slide left"
              width={30}
              height={30}
            />
          </button>
        )}

        {/* slider container and element */}
        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[300px] overflow-x-scroll scrollbar-hide gap-2 pb-4 relative"
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
              currency={event.currency}
              created_at={event.created_at}
              capacity={event.capacity}
              attendanceCount={event.attendanceCount}
              status={event.status}
            />
          ))}
        </ul>

        {/* slide right button */}
        {events.length !== 0 && (
          <button
            type="button"
            onClick={() => scroll("right")}
            className="bg-white shadow-xl hidden md:grid place-items-center rounded-full w-10 h-10 absolute top-[50%] -translate-y-[50%] right-0 rotate-180"
          >
            <Image
              src="/assets/images/moveBack.svg"
              alt="Slide right"
              width={30}
              height={30}
            />
          </button>
        )}
      </div>
    </div>
  );
}
