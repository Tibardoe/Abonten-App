"use client";

// import { allEvents } from "@/data/allEvents";
import type { UserPostType } from "@/types/postsType";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
// import { useEffect, useState } from "react";
// import { FaArrowRight } from "react-icons/fa";
import { FaArrowRightLong } from "react-icons/fa6";
import { FiCalendar, FiClock, FiMapPin } from "react-icons/fi";
import { PiTicketBold } from "react-icons/pi";

interface BannerProps {
  event: UserPostType | null;
}

export default function Banner({ event }: BannerProps) {
  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  if (!event || !event.flyer_public_id) return null;

  const dateTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.event_dates,
  );

  return (
    <div className="group relative w-full h-[250px] md:h-[350px] rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
      {/* Background Image with Gradient Overlay */}
      <div className="absolute inset-0">
        <Image
          src={`${cloudinaryBaseUrl}v${event.flyer_version}/${event.flyer_public_id}.jpg`}
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
        <div className="absolute top-2 right-2 xs:top-3 xs:right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 lg:top-6 lg:right-6 bg-black text-mint px-2 py-0.5 xs:px-2.5 xs:py-1 sm:px-3 sm:py-1 rounded-full text-xs xs:text-sm font-medium flex items-center gap-1">
          <PiTicketBold className="text-xs xs:text-sm" />
          <span className="xs:inline">FEATURED</span>
        </div>

        {/* Event Info */}
        <div className="w-fit space-y-1 xs:space-y-1.5 sm:space-y-2 md:space-y-3 lg:space-y-4">
          {/* Most Anticipated Tag */}
          <div className="mb-1 xs:mb-1.5 sm:mb-2">
            <span className="inline-block px-2 py-0.5 xs:px-2.5 xs:py-1 sm:px-3 sm:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs xs:text-sm font-medium">
              Most Anticipated
            </span>
          </div>

          {/* Event Title - Responsive font sizes */}

          <Link
            href={`/events/${generateSlug(event.address.full_address)}/${
              event.event_code
            }`}
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
              <span className="truncate">
                {event.address.full_address || "Venue TBA"}
              </span>
            </div>

            <div className="flex items-center gap-1 xs:gap-2">
              <FiCalendar className="flex-shrink-0 text-xs xs:text-sm" />
              <span>{dateTime ? dateTime.date : "Date TBA"}</span>
            </div>

            <div className="flex items-center gap-1 xs:gap-2">
              <FiClock className="flex-shrink-0 text-xs xs:text-sm" />
              <span>{dateTime.time || "Time TBA"}</span>
            </div>
          </div>

          {/* Price & CTA - Responsive layout and sizing */}
          <div className="mt-3 flex md:flex-col md:items-start items-center justify-between gap-2">
            <div className="px-2 py-1 xs:px-3 xs:py-1.5 sm:px-4 sm:py-2 bg-white/20 backdrop-blur-sm rounded-full font-medium text-xs xs:text-sm">
              {event.min_price === 0 || event.min_price === null
                ? "FREE ENTRY"
                : `FROM ${event.currency} ${event.min_price}`}
            </div>

            <Link
              href={`/events/${event.event_code}`}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-black hover:bg-gray-400 text-mint rounded-md transition-colors flex items-center gap-1 xs:gap-2 text-xs md:text-sm"
            >
              View Details
              <FaArrowRightLong className="text-mint" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
