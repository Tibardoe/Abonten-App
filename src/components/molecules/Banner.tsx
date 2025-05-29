"use client";

import { allEvents } from "@/data/allEvents";
import type { PostsType } from "@/types/postsType";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowRight } from "react-icons/fa";
import { FaArrowRightLong } from "react-icons/fa6";
import { FiCalendar, FiClock, FiMapPin } from "react-icons/fi";
import { PiTicketBold } from "react-icons/pi";

export default function Banner() {
  const [event, setEvent] = useState<PostsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  useEffect(() => {
    try {
      const savedData = localStorage.getItem("dailyEvent");
      const now = Date.now();

      if (savedData) {
        const { event, timestamp } = JSON.parse(savedData);
        if (now - timestamp < ONE_DAY_MS) {
          setEvent(event);
          setIsLoading(false);
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
    } catch (err) {
      setError("Failed to load featured event");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-[180px] xs:h-[220px] sm:h-[280px] md:h-[350px] lg:h-[400px] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    );
  }

  if (error || !event || !event.flyerUrl) {
    return null; // or render an error state
  }

  return (
    <div className="group relative w-full h-[250px] md:h-[350px] lg:h-[400px] rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
      {/* Background Image with Gradient Overlay */}
      <div className="absolute inset-0">
        <Image
          src={event.flyerUrl}
          alt={`${event.title} event flyer`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority
          quality={90}
          sizes="(max-width: 375px) 100vw, (max-width: 640px) 90vw, (max-width: 768px) 80vw, (max-width: 1024px) 70vw, 60vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-3 xs:p-4 sm:p-5 md:p-6 lg:p-8 text-white">
        {/* Badge - Responsive positioning and size */}
        <div className="absolute top-2 right-2 xs:top-3 xs:right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 lg:top-6 lg:right-6 bg-black text-white px-2 py-0.5 xs:px-2.5 xs:py-1 sm:px-3 sm:py-1 rounded-full text-xs xs:text-sm font-medium flex items-center gap-1">
          <PiTicketBold className="text-white text-xs xs:text-sm" />
          <span className="xs:inline">FEATURED</span>
        </div>

        {/* Event Info */}
        <div className="max-w-2xl space-y-1 xs:space-y-1.5 sm:space-y-2 md:space-y-3 lg:space-y-4">
          {/* Most Anticipated Tag */}
          <div className="mb-1 xs:mb-1.5 sm:mb-2">
            <span className="inline-block px-2 py-0.5 xs:px-2.5 xs:py-1 sm:px-3 sm:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs xs:text-sm font-medium">
              Most Anticipated
            </span>
          </div>

          {/* Event Title - Responsive font sizes */}
          <Link
            href={`/events/${event.title && generateSlug(event.title)}`}
            className="block mb-2 xs:mb-3 sm:mb-4"
          >
            <h2 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
              {event.title}
            </h2>
          </Link>

          {/* Meta Information - Responsive grid layout */}
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 text-xs md:text-base">
            <div className="flex items-center gap-1 xs:gap-2">
              <FiMapPin className="flex-shrink-0 text-xs xs:text-sm" />
              <span className="truncate">{event.location || "Venue TBA"}</span>
            </div>

            <div className="flex items-center gap-1 xs:gap-2">
              <FiCalendar className="flex-shrink-0 text-xs xs:text-sm" />
              <span>
                {event.start_at
                  ? formatDateWithSuffix(event.start_at)
                  : "Date TBA"}
              </span>
            </div>

            <div className="flex items-center gap-1 xs:gap-2">
              <FiClock className="flex-shrink-0 text-xs xs:text-sm" />
              <span>{event.timezone || "Time TBA"}</span>
            </div>
          </div>

          {/* Price & CTA - Responsive layout and sizing */}
          <div className="mt-3 flex md:flex-col md:items-start items-center justify-between gap-2">
            {event.price && (
              <div className="px-2 py-1 xs:px-3 xs:py-1.5 sm:px-4 sm:py-2 bg-white/20 backdrop-blur-sm rounded-full font-medium text-xs xs:text-sm">
                {event.price === "Free" ? "FREE ENTRY" : `FROM ${event.price}`}
              </div>
            )}

            <Link
              href={`/events/${event.title && generateSlug(event.title)}`}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-black hover:bg-gray-400 text-white rounded-md transition-colors flex items-center gap-1 xs:gap-2 text-xs md:text-sm"
            >
              View Details
              <FaArrowRightLong />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
