import { getEvents } from "@/actions/getEvents";
import { getUserRating } from "@/actions/getUserRating";
import SlugImage from "@/components/atoms/SlugImage";
import EventCard from "@/components/molecules/EventCard";
import EventsSlider from "@/components/organisms/EventsSlider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/config/supabase/server";
import { allEvents } from "@/data/allEvents";
import { getRelativeTime } from "@/utils/dateFormatter";
import {
  formatDateWithSuffix,
  formatFullDateTimeRange,
} from "@/utils/dateFormatter";
import Image from "next/image";
import Link from "next/link";

export default async function page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createClient();

  const title = (await params).slug;

  const unformatTitle = title
    .split("-") // Split the string by hyphens

    .join(" "); // Join the words back with spaces

  const { data: event } = await supabase
    .from("event")
    .select(
      "*, user_info!event_organizer_id_fkey(avatar_public_id,avatar_version,username)",
    )
    .eq("slug", title)
    .single();

  const { data: similarEvents } = await supabase
    .from("event")
    .select("*")
    .eq("event_category", event.event_category);

  const postedAt = getRelativeTime(event.created_at);

  const eventDateAndTime = formatFullDateTimeRange(
    event.starts_at,
    event.ends_at,
  );

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const tags =
    typeof event.event_type === "string"
      ? JSON.parse(event.event_type)
      : event.event_type; // if it's already an array

  const averageRating = await getUserRating(event.organizer_id);

  if (!event) {
    return <p>No event found</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-4">
        <h1>Posted by</h1>

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Link href={`/user/${"Big_Ceo"}/posts`}>
              <div className="bg-black rounded-full w-20 h-20" />
            </Link>

            <div>
              <Link href={`/user/${event.user_info.username}/posts`}>
                {event.user_info.username}
              </Link>

              <p>
                <span className="font-bold">{averageRating.averageRating}</span>{" "}
                Ratings
              </p>
            </div>
          </div>

          {/* Posted at */}
          <p>{postedAt}</p>
        </div>
      </div>

      <div className="md:grid grid-cols-2 gap-5 md:h-[700px]">
        <SlugImage
          flyerUrl={`${cloudinaryBaseUrl}v${event.flyer_version}/${event.flyer_public_id}.jpg`}
        />

        {/* Event details */}
        <div className="flex flex-col gap-5 md:overflow-y-scroll">
          {/* title */}
          <h2 className="font-bold mt-3 md:mt-0 text-lg md:text-2xl">
            {event.title}
          </h2>

          {/* description */}
          <div>
            <h2 className="font-bold md:text-lg">Description</h2>
            <p className="text-justify">{event.description}</p>
          </div>

          {/* Event date, time, location and price */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center col-span-2">
              <Image
                src="/assets/images/location.svg"
                alt="Event flyer"
                width={20}
                height={20}
              />

              <p>{event.address.full_address}</p>
            </div>

            <div className="flex items-center gap-2">
              <Image
                src="/assets/images/date.svg"
                alt="Event flyer"
                width={15}
                height={15}
              />

              <p>{eventDateAndTime.date}</p>
            </div>

            <div className="flex items-center gap-1">
              <Image
                src="/assets/images/time.svg"
                alt="Event flyer"
                width={20}
                height={20}
              />

              <p>{eventDateAndTime.time}</p>
            </div>

            <p>
              {event.price === 0 || event.price === null
                ? "Free"
                : `${event.currency} ${event.price}`}
            </p>

            {event.capacity && <p>Capacity: {event.capacity}</p>}
          </div>

          {/* Buttons */}

          <div className="flex flex-col gap-3">
            {event.price === 0 || event.price === null ? (
              ""
            ) : (
              <Button className="font-bold rounded-full w-full p-6 text-lg">
                Buy Ticket
              </Button>
            )}

            <div className="grid grid-cols-2 outline-none gap-3">
              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/direction.svg"
                  alt="Direction"
                  width={30}
                  height={30}
                />
                Direction
              </Button>
              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/share.svg"
                  alt="Share"
                  width={30}
                  height={30}
                />
                Share
              </Button>
              {event.website_url && (
                <Link
                  href={event.website_url}
                  className="rounded-full text-lg p-1 md:p-2 border border-black flex items-center justify-center gap-3"
                >
                  <Image
                    src="/assets/images/website.svg"
                    alt="Website"
                    width={30}
                    height={30}
                  />
                  {event.website_url}
                </Link>
              )}

              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/contact.svg"
                  alt="Contact"
                  width={30}
                  height={30}
                />
                Contact
              </Button>
            </div>

            {/* Event category and tag */}
            <div className="space-y-5 mt-5">
              <div className="space-y-2">
                <h2 className="font-bold md:text-lg">EVENT CATEGORY</h2>
                <button
                  type="button"
                  className="rounded-xl text-lg p-2 md:p-3 border border-black w-full"
                >
                  {event.event_category}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="font-bold md:text-lg">TAG</h2>
                {tags.map((tag: string) => (
                  <button
                    type="button"
                    key={tag}
                    className="rounded-xl text-lg p-2 md:p-3 border border-black w-full"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <EventsSlider
        heading="Similar Events"
        events={similarEvents ?? []}
        eventCategory={event.event_category}
      />
    </div>
  );
}
