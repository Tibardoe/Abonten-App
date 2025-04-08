import type { PostsType } from "@/types/postsType";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";

export default function EventCard({
  title,
  flyerUrl,
  location,
  start_at,
  end_at,
  timezone,
  price,
}: PostsType) {
  return (
    <li key={title} className="space-y-2">
      <Link href={`/events/${title && generateSlug(title)}`}>
        <Image
          src={flyerUrl || "/default-image.jpg"}
          alt="Event flyer"
          width={300}
          height={300}
          className="w-full md:h-[350px]"
        />
      </Link>

      <div className="flex flex-col gap-2 justify-start text-sm">
        <div className="flex justify-between">
          <Link href="#" className="font-bold text-lg md:text-xl col-span-2">
            {title}
          </Link>

          <button type="button">
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

          <p>{location}</p>
        </div>

        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/date.svg"
            alt="Event flyer"
            width={15}
            height={15}
          />

          <p>
            {start_at ? formatDateWithSuffix(start_at) : "Date not available"} -
            {end_at ? formatDateWithSuffix(end_at) : "End date not available"}
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

            <p>{timezone}</p>
          </div>

          <p>{price}</p>
        </div>
      </div>
    </li>
  );
}
