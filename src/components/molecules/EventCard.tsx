import type { UserPostType } from "@/types/postsType";
import { formatFullDateTimeRange } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import EventCardFlyerImage from "../atoms/EventCardFlyerImage";

export default function EventCard({
  title,
  flyerUrl,
  address,
  starts_at,
  ends_at,
  price,
}: UserPostType) {
  const dateTime = formatFullDateTimeRange(starts_at, ends_at);

  return (
    <li key={title} className="space-y-2 shadow-lg">
      <Link href={`/events/${title && generateSlug(title)}`}>
        <EventCardFlyerImage
          flyerUrl={flyerUrl ?? "/assets/images/default-flyer.png"}
        />
      </Link>

      <div className="flex flex-col gap-2 justify-start text-sm p-3">
        <div className="flex justify-between items-start">
          <Link
            href={`/events/${title && generateSlug(title)}`}
            className="font-bold text-lg md:text-xl flex-grow"
          >
            {title}
          </Link>

          <button type="button" className="flex-shrink-0">
            <Image
              src="/assets/images/menuDots.svg"
              alt="Event flyer"
              width={20}
              height={20}
            />
          </button>
        </div>

        <div className="flex items-center">
          <Image
            src="/assets/images/location.svg"
            alt="Event flyer"
            width={20}
            height={20}
          />

          <p>{address?.full_address ? address.full_address : "No address"}</p>
        </div>

        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/date.svg"
            alt="Event flyer"
            width={15}
            height={15}
          />

          <p>
            {starts_at ? dateTime.date : "Date not available"} -
            {ends_at ? dateTime.date : "End date not available"}
          </p>
        </div>

        <div className="flex justify-between">
          <div className="flex items-center gap-1">
            <Image
              src="/assets/images/time.svg"
              alt="Event flyer"
              width={20}
              height={20}
            />

            <p>{starts_at ? dateTime.time : "Time not available"}</p>
          </div>

          <p>{price === 0 || price === null ? "Free" : price}</p>
        </div>
      </div>
    </li>
  );
}
