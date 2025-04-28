"use client";

import type { UserPostType } from "@/types/postsType";
import { formatFullDateTimeRange } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
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
  price,
  capacity,
  id,
}: UserPostType) {
  const dateTime = formatFullDateTimeRange(starts_at, ends_at);

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const { location } = useParams();

  return (
    <li key={title} className="space-y-2 shadow-lg">
      <Link href={`/events/${location}/event/${title && generateSlug(title)}`}>
        <EventCardFlyerImage
          flyerUrl={`${cloudinaryBaseUrl}v${flyer_version}/${flyer_public_id}.jpg`}
        />
      </Link>

      <div className="flex flex-col gap-2 justify-start text-sm p-3">
        <div className="flex justify-between items-start">
          <Link
            href={`/events/${location}/event/${title && generateSlug(title)}`}
            className="font-bold text-lg md:text-xl flex-grow"
          >
            {title}
          </Link>

          {/* <button type="button" className="flex-shrink-0">
            <Image
              src="/assets/images/menuDots.svg"
              alt="Event flyer"
              width={20}
              height={20}
            />
          </button> */}

          <EventCardMenuBtn eventId={id} />
        </div>

        <div className="flex justify-between items-start font-semibold mb-2">
          <p>
            Capacity: {`${capacity && capacity > 0 ? capacity : "Unlimited"}`}
          </p>

          <p>Attending: {`${0}`}</p>
        </div>

        <div className="flex items-center gap-2">
          <IoLocationOutline className="text-xl" />

          <p>{address?.full_address ? address.full_address : "No address"}</p>
        </div>

        <div className="flex items-center gap-2">
          <MdOutlineDateRange className="text-xl" />

          <p>
            {starts_at ? dateTime.date : "Date not available"} -
            {ends_at ? dateTime.date : "End date not available"}
          </p>
        </div>

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <IoTimeOutline className="text-xl" />

            <p>{starts_at ? dateTime.time : "Time not available"}</p>
          </div>

          <p>{price === 0 || price === null ? "Free" : price}</p>
        </div>
      </div>
    </li>
  );
}
