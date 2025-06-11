"use client";

import type { UserPostType } from "@/types/postsType";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import { getEventStatusOverlay } from "@/utils/getEventStatusOverlay";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
// import EventCardFlyerImage from "../atoms/EventCardFlyerImage";
import EventCardMenuBtn from "../atoms/EventCardMenuBtn";

export default function EventCard({
  title,
  flyer_public_id,
  flyer_version,
  address,
  starts_at,
  ends_at,
  event_dates,
  min_price,
  attendanceCount,
  currency,
  capacity,
  id,
  event_code,
  status,
}: UserPostType) {
  const dateTime = getFormattedEventDate(starts_at, ends_at, event_dates);

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const { location } = useParams();

  const overlayMessage = getEventStatusOverlay(starts_at, ends_at, event_dates);

  return (
    <li
      key={title}
      className="relative overflow-hidden rounded-xl shadow-md border border-gray-200 transition-transform hover:scale-[1.015] bg-white"
    >
      {status === "canceled" && (
        <div className="absolute left-0 top-0 w-full h-full bg-black bg-opacity-60 text-gray-300 z-10 md:text-xl text-2xl flex justify-center items-center font-bold">
          Event canceled
        </div>
      )}

      {overlayMessage && status !== "canceled" && (
        <div className="absolute left-0 top-0 w-full h-full bg-black bg-opacity-50 text-gray-300 z-10 md:text-xl text-2xl flex justify-center items-center font-bold">
          {overlayMessage}
        </div>
      )}

      {/* <Link
        href={`/events/${
          location ? location : generateSlug(address.full_address)
        }/event/${title && generateSlug(title)}`}
      >
        <EventCardFlyerImage
          flyerUrl={`${cloudinaryBaseUrl}v${flyer_version}/${flyer_public_id}.jpg`}
        />
      </Link> */}

      <Link
        href={`/events/${
          location ? location : generateSlug(address.full_address)
        }/${event_code}`}
        className="block relative h-56 w-full overflow-hidden rounded-t-2xl"
      >
        <Image
          src={`${cloudinaryBaseUrl}v${flyer_version}/${flyer_public_id}.jpg`}
          alt={`Flyer for ${title}`}
          layout="fill"
          objectFit="cover"
          className="transition-transform duration-300 hover:scale-105"
          priority
        />
      </Link>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex justify-between items-start">
          <Link
            href={`/events/${location}/event/${generateSlug(title)}`}
            className="text-xl font-semibold text-gray-800"
          >
            {title}
          </Link>

          <EventCardMenuBtn
            eventId={id}
            eventTitle={title}
            address={address.full_address}
          />
        </div>

        <div className="flex justify-between text-sm text-gray-600">
          <span>
            Capacity: {capacity && capacity > 0 ? capacity : "Unlimited"}
          </span>
          <span>Attending: {attendanceCount}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-700 text-sm">
          <IoLocationOutline className="text-lg" />
          <p>{address?.full_address || "No address"}</p>
        </div>

        <div className="flex items-center gap-2 text-gray-700 text-sm">
          <MdOutlineDateRange className="text-lg" />
          <p>{dateTime?.date || "Date not available"}</p>
        </div>

        <div className="flex justify-between items-center text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <IoTimeOutline className="text-lg" />
            <p>{dateTime?.time || "Time not available"}</p>
          </div>

          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              min_price === 0 || min_price === null
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {min_price === 0 || min_price === null
              ? "Free"
              : `${currency} ${min_price}`}
          </span>
        </div>
      </div>
    </li>
  );
}
