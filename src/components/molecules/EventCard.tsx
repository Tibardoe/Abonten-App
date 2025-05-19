"use client";

import type { UserPostType } from "@/types/postsType";
import {
  formatFullDateTimeRange,
  getFormattedEventDate,
} from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import { getEventStatusOverlay } from "@/utils/getEventStatusOverlay";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import EventCardFlyerImage from "../atoms/EventCardFlyerImage";
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
  status,
}: UserPostType) {
  const dateTime = getFormattedEventDate(starts_at, ends_at, event_dates);

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const { location } = useParams();

  const overlayMessage = getEventStatusOverlay(starts_at, ends_at, event_dates);

  console.log(
    `event_dates:${event_dates}, starts_at:${starts_at}, ends_at:${ends_at}`,
  );

  return (
    <li key={title} className="space-y-2 shadow-lg relative">
      {status === "canceled" && (
        <div className="absolute left-0 top-0 w-full h-full bg-black bg-opacity-60 text-gray-300 z-10 md:text-xl text-2xl flex justify-center items-center font-bold">
          Event canceled
        </div>
      )}

      {overlayMessage && status !== "canceled" && (
        <div className="absolute left-0 top-0 w-full h-full bg-black bg-opacity-50 text-white z-10 md:text-xl text-2xl flex justify-center items-center font-bold">
          {overlayMessage}
        </div>
      )}

      <Link
        href={`/events/${
          location ? location : generateSlug(address.full_address)
        }/event/${title && generateSlug(title)}`}
      >
        <EventCardFlyerImage
          flyerUrl={`${cloudinaryBaseUrl}v${flyer_version}/${flyer_public_id}.jpg`}
        />
      </Link>

      <div className="flex flex-col gap-2 justify-start text-sm p-3">
        <div className="flex justify-between items-start">
          <Link
            href={`/events/${location}/event/${title && generateSlug(title)}`}
            className="font-bold text-lg md:text-xl"
          >
            {title}
          </Link>

          <EventCardMenuBtn
            eventId={id}
            eventTitle={title}
            address={address.full_address}
          />
        </div>

        <div className="flex justify-between items-start font-semibold mb-2">
          <p>
            Capacity: {`${capacity && capacity > 0 ? capacity : "Unlimited"}`}
          </p>

          <p>Attending: {attendanceCount}</p>
        </div>

        <div className="flex items-center gap-2">
          <IoLocationOutline className="text-xl shrink-0" />

          <p>{address?.full_address ? address.full_address : "No address"}</p>
        </div>

        <div className="flex items-center gap-2">
          <MdOutlineDateRange className="text-xl shrink-0" />

          {/* <p>
            {starts_at ? dateTime.date : "Date not available"} -
            {ends_at ? dateTime.date : "End date not available"}
          </p> */}

          <p>{dateTime ? dateTime.date : "Date not available"}</p>
        </div>

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <IoTimeOutline className="text-xl shrink-0" />

            {/* <p>{starts_at ? dateTime.time : "Time not available"}</p> */}

            <p>{dateTime ? dateTime.time : "Time not available"}</p>
          </div>

          <p>
            {min_price === 0 || min_price === null
              ? "Free"
              : `${currency} ${min_price}`}
          </p>
        </div>
      </div>
    </li>
  );
}
