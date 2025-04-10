"use client";

import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import EventCard from "../molecules/EventCard";

type EventsSliderProp = {
  heading: string;
  eventCategory?: string;
  urlPath?: string;
  events: {
    flyerUrl: string;
    title: string;
    description: string;
    price: string;
    location: string;
    startDate: string;
    endDate: string;
    time: string;
    category: string;
    type: string;
    telephone: string;
    website: string;
  }[];
};

export default function EventsSlider({
  heading,
  events,
  eventCategory,
  urlPath,
}: EventsSliderProp) {
  const scrollRef = useRef<HTMLUListElement>(null);

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
    <div className="my-10 space-y-5">
      <div className="flex justify-between font-bold">
        <h2 className="text-xl">{heading}</h2>

        <Link
          href={
            urlPath
              ? `/events/${urlPath}`
              : `/events/category?category=${
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
        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[300px] overflow-x-scroll scrollbar-hide gap-2 pb-4"
        >
          {events.map((event) => (
            <EventCard
              key={event.title}
              title={event.title}
              flyerUrl={event.flyerUrl}
              location={event.location}
              start_at={event.startDate}
              end_at={event.endDate}
              timezone={event.time}
              price={event.price}
            />
          ))}
        </ul>

        <button
          type="button"
          onClick={() => scroll("right")}
          className="bg-white shadow-xl hidden md:grid place-items-center rounded-full w-10 h-10 absolute top-[50%] -translate-y-[50%] right-0 rotate-180"
        >
          <Image
            src="/assets/images/moveBack.svg"
            alt="Slide left"
            width={30}
            height={30}
            className=""
          />
        </button>
      </div>
    </div>
  );
}
