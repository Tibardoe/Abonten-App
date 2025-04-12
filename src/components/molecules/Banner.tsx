"use client";

import { allEvents } from "@/data/allEvents";
import type { PostsType } from "@/types/postsType";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Banner() {
  const [event, setEvent] = useState<PostsType | null>(null);

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  useEffect(() => {
    const savedData = localStorage.getItem("dailyEvent");

    const now = Date.now();

    if (savedData) {
      const { event, timestamp } = JSON.parse(savedData);

      if (now - timestamp < ONE_DAY_MS) {
        setEvent(event);
        return;
      }
    }

    const randomIndex = Math.floor(Math.random() * allEvents.length);
    const selected = allEvents[randomIndex];

    localStorage.setItem(
      "dailyEvent",
      JSON.stringify({ event: selected, timestamp: now }),
    );

    setEvent(selected);
  }, []);

  if (!event || !event.flyerUrl) return null;

  return (
    <div className="bg-black h-[200px] md:h-[300px] rounded-lg bg-opacity-10 flex justify-between items-start gap-3 md:gap-5 shadow-lg">
      <Link
        href={`/events/${event.title && generateSlug(event.title)}`}
        className="w-1/2 h-[200px] md:h-[300px] aspect-video"
      >
        <Image
          src={event?.flyerUrl}
          alt="Event flyer"
          width={500}
          height={500}
          className="w-full h-full rounded-l-lg object-cover"
        />
      </Link>

      {/* Details */}
      <div className="py-3 md:py-5 flex flex-col h-full justify-between gap-1 md:gap-4 pr-5 w-1/2">
        <h2 className="font-bold text-sm md:text-lg">Most anticipated</h2>
        <Link
          href={`/events/${event.title && generateSlug(event.title)}`}
          className="font-bold text-lg md:text-4xl mb-auto md:mb-0"
        >
          {event.title}
        </Link>

        {/* Location, time and date */}
        <div className="flex flex-col text-sm gap-1 md:gap-2 md:gap-x-5 md:text-lg">
          <div className="flex items-center">
            <Image
              src="/assets/images/location.svg"
              alt="Event flyer"
              width={20}
              height={20}
            />

            <p>{event.location}</p>
          </div>

          <div className="hidden md:flex items-center gap-1">
            <Image
              src="/assets/images/time.svg"
              alt="Event flyer"
              width={20}
              height={20}
            />

            <p>{event.timezone ? event.timezone : "9:00Pm"}</p>
          </div>

          <div className="flex items-center gap-2">
            <Image
              src="/assets/images/date.svg"
              alt="Event flyer"
              width={15}
              height={15}
            />

            <p>
              {event.start_at
                ? formatDateWithSuffix(event.start_at)
                : "12th Feb, 2026"}
            </p>
          </div>

          <p className="hidden md:flex">{event.price}</p>
        </div>
      </div>
    </div>
  );
}
