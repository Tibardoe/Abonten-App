import { getNearByEvents } from "@/actions/getNearByEvents";
import { getUserRating } from "@/actions/getUserRating";
import BuyTicketBtn from "@/components/atoms/CheckoutBtn";
import DateBtn from "@/components/atoms/DateBtn";
import SlugImage from "@/components/atoms/SlugImage";
import UserAvatar from "@/components/atoms/UserAvatar";
import EventDateSelector from "@/components/molecules/EventDateSelector";
import EventsSlider from "@/components/organisms/EventsSlider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/config/supabase/server";
import type { UserPostType } from "@/types/postsType";
import {
  getDateParts,
  getFormattedEventDate,
  getRelativeTime,
} from "@/utils/dateFormatter";
import Image from "next/image";
import Link from "next/link";
import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";

export default async function page({
  params,
}: {
  params: Promise<{ slug: string; location: string }>;
}) {
  const supabase = await createClient();

  const { slug, location } = await params;

  const unformatTitle = slug
    .split("-") // Split the string by hyphens

    .join(" "); // Join the words back with spaces

  const { data: event } = await supabase
    .from("event")
    .select(
      "*, user_info!organizer_id(avatar_public_id, avatar_version, username), ticket_type(id, type, price, currency, available_from, available_until)",
    )
    .eq("slug", slug)
    .single();

  const { count: attendanceCount, error: attendanceError } = await supabase
    .from("attendance") // or your table name
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id);

  // Fetch the minimum ticket type by price
  const { data: minTicket } = await supabase
    .from("ticket_type")
    .select("id, type, price, currency")
    .eq("event_id", event.id)
    .order("price", { ascending: true })
    .limit(1)
    .single();

  const safeLocation = location ?? "";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(
    `${baseUrl}/api/geocode?address=${encodeURIComponent(safeLocation)}`,
  );

  const { lat, lng } = await res.json();

  const eventsWithinLocation = await getNearByEvents(lat, lng, 10);

  const data: UserPostType[] = eventsWithinLocation.data || [];

  const similarEvents = data.filter(
    (evt) => evt.event_category === event.event_category && evt.id !== event.id,
  );

  const postedAt = getRelativeTime(event.created_at);

  const eventDateAndTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.event_dates,
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
            <Link
              href={`/user/${event.user_info.username}/posts`}
              className="shrink-0"
            >
              <UserAvatar
                width={100}
                height={100}
                avatarUrl={`${cloudinaryBaseUrl}v${event.user_info.avatar_version}/${event.user_info.avatar_public_id}.jpg`}
              />
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
            <div className="flex items-center gap-1 md:gap-2 col-span-2">
              <IoLocationOutline className="text-xl md:text-2xl" />

              <p>{event.address.full_address}</p>
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              <MdOutlineDateRange className="text-xl md:text-2xl" />

              <p>{eventDateAndTime.date}</p>
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              <IoTimeOutline className="text-xl md:text-2xl" />

              <p>{eventDateAndTime.time}</p>
            </div>

            <p>
              {minTicket?.price === 0 || minTicket === null
                ? "Free"
                : `${minTicket?.currency} ${minTicket?.price}`}
            </p>

            {event.capacity && <p>Capacity: {event.capacity}</p>}

            <p>Attendance: {attendanceCount}</p>
          </div>

          {/* Dates if event has a date range */}
          {event.event_dates?.length > 0 ? (
            <EventDateSelector
              eventDates={event.event_dates}
              eventId={event.id}
              time={eventDateAndTime.time}
              eventTitle={event.title}
              minTicket={minTicket}
            />
          ) : (
            <BuyTicketBtn
              eventId={event.id}
              btnText={
                minTicket?.price === 0 || minTicket === null
                  ? "Register"
                  : "Buy Ticket"
              }
              eventTitle={event.title}
              date={eventDateAndTime.date}
              time={eventDateAndTime.time}
            />
          )}

          {/* Buttons */}
          <div className="flex flex-col gap-3">
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
                <a
                  href={`https://${event.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full text-lg p-1 md:p-2 border border-black flex items-center justify-center gap-3"
                >
                  <Image
                    src="/assets/images/website.svg"
                    alt="Website"
                    width={30}
                    height={30}
                  />
                  {event.website_url}
                </a>
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
