import { getNearByEvents } from "@/actions/getNearByEvents";
import { getUserRating } from "@/actions/getUserRating";
import BuyTicketBtn from "@/components/atoms/CheckoutBtn";
import GetDirectionBtn from "@/components/atoms/GetDirectionBtn";
import OutlinedShareBtn from "@/components/atoms/OutlinedShareBtn";
import EventDateSelector from "@/components/molecules/EventDateSelector";
import EventsSlider from "@/components/organisms/EventsSlider";
import { createClient } from "@/config/supabase/server";
import type { UserPostType } from "@/types/postsType";
import { getFormattedEventDate, getRelativeTime } from "@/utils/dateFormatter";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import Image from "next/image";
import Link from "next/link";
import { FiArrowUpRight, FiMail } from "react-icons/fi";
import { IoLocationOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import { PiTicketBold } from "react-icons/pi";

export default async function page({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const supabase = await createClient();

  const { eventCode } = await params;

  const { data: event } = await supabase
    .from("event")
    .select(
      "*, user_info!organizer_id(avatar_public_id, avatar_version, username), ticket_type(id, type, price, currency, available_from, available_until)",
    )
    .eq("event_code", eventCode.toUpperCase())
    .single();

  if (!event) return <p className="p-8 text-center">No event found</p>;

  const { count: attendanceCount } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id);

  const { data: minTicket } = await supabase
    .from("ticket_type")
    .select("id, type, price, currency")
    .eq("event_id", event.id)
    .order("price", { ascending: true })
    .limit(1)
    .single();

  const safeLocation = event.address.full_address ?? "";
  // const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  // const res = await fetch(
  //   `${baseUrl}/api/geocode?address=${encodeURIComponent(safeLocation)}`,
  // );

  const res = await geocodeAddress(safeLocation);

  const { lat, lng } = res;
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
  const tags = Array.isArray(event.event_type)
    ? event.event_type
    : typeof event.event_type === "string"
      ? JSON.parse(event.event_type)
      : [];

  const averageRating = await getUserRating(event.organizer_id);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="relative h-72 md:h-[500px] bg-gray-200">
        <Image
          src={`${cloudinaryBaseUrl}v${event.flyer_version}/${event.flyer_public_id}.jpg`}
          alt={event.title}
          fill
          className="object-cover object-center"
          priority
          sizes="(max-width: 768px) 100vw, 80vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 space-y-2 md:space-y-4">
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-2xl">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="px-3 py-1.5 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-white flex items-center gap-2 text-sm md:text-base">
              <PiTicketBold className="text-white/80" />
              {minTicket?.price === 0 || minTicket === null ? (
                <span>Free Entry</span>
              ) : (
                <span>
                  From {minTicket?.currency} {minTicket?.price}
                </span>
              )}
            </span>
            <span className="px-3 py-1.5 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-white text-sm md:text-base">
              🎉 {attendanceCount} Attendees
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 lg:px-8 py-8 md:py-12">
        <div className="md:grid lg:grid-cols-3 gap-6 md:gap-8 flex flex-col">
          {/* Event Details */}
          <div className="lg:col-span-2 space-y-6 md:space-y-8">
            {/* Organizer Card */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <Link
                  href={`/user/${event.user_info.username}/posts`}
                  className="shrink-0 hover:scale-105 transition-transform"
                >
                  <Image
                    src={`${cloudinaryBaseUrl}v${event.user_info.avatar_version}/${event.user_info.avatar_public_id}.jpg`}
                    alt={event.user_info.username}
                    width={56}
                    height={56}
                    className="rounded-full border-2 border-black"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/user/${event.user_info.username}/posts`}
                    className="text-lg font-semibold text-gray-800 truncate"
                  >
                    {event.user_info.username}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={`star-${i.toLocaleString()}`}
                          className={`text-sm ${
                            i < Math.floor(averageRating.averageRating)
                              ? "text-gray-800"
                              : "text-gray-300"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-gray-500">
                      ({averageRating.averageRating.toFixed(1)})
                    </span>
                  </div>
                </div>
                <span className="text-sm text-gray-500 shrink-0">
                  Posted {postedAt}
                </span>
              </div>
            </div>

            {/* Action Buttons - Mobile Top */}
            <div className="lg:hidden grid grid-cols-2 gap-2">
              <OutlinedShareBtn
                title={event.title}
                address={event.address.full_address}
                eventCode={event.event_code}
              />

              <button
                type="button"
                className="flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg text-sm hover:bg-gray-800 transition-colors"
              >
                <FiMail /> Contact
              </button>
            </div>

            {/* Event Info Grid */}
            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm">
                <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                  <IoLocationOutline className="text-xl md:text-2xl text-gray-800" />
                  <h3 className="text-lg font-semibold">Location</h3>
                </div>
                <p className="text-gray-600 mb-4 text-sm md:text-base">
                  {event.address.full_address}
                </p>
                <GetDirectionBtn location={event.location} />
              </div>

              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm">
                <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                  <MdOutlineDateRange className="text-xl md:text-2xl text-gray-800" />
                  <h3 className="text-lg font-semibold">Date & Time</h3>
                </div>
                <p className="text-gray-600 text-sm md:text-base">
                  {eventDateAndTime.date}
                </p>
                <p className="text-gray-600 text-sm md:text-base">
                  {eventDateAndTime.time}
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-xl md:text-2xl font-semibold mb-3 md:mb-4 text-gray-800">
                About the Event
              </h2>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                {event.description}
              </p>
            </div>

            {/* Action Buttons - Desktop */}
            <div className="hidden lg:grid grid-cols-3 gap-4">
              <OutlinedShareBtn
                title={event.title}
                address={event.address.full_address}
                eventCode={event.event_code}
              />

              <button
                type="button"
                className="flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <FiMail className="text-lg" /> Contact Organizer
              </button>
              {event.website_url && (
                <a
                  href={`https://${event.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Website <FiArrowUpRight className="text-lg" />
                </a>
              )}
            </div>

            {/* Ticket CTA */}
            <div className="bg-white rounded-xl p-1 shadow-lg hover:shadow-xl transition-all">
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
                  requireRegistration={event.require_registration}
                />
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 md:space-y-6">
            {/* Event Category */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-3 md:mb-4 text-gray-800">
                Event Category
              </h3>
              <div className="flex">
                <span className="p-2 text-center border border-black w-full bg-gray-100 text-gray-600 rounded-full text-xs md:text-sm">
                  {event.event_category}
                </span>
              </div>
            </div>

            {/* Event Tags */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-3 md:mb-4 text-gray-800">
                Event Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs md:text-sm"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Buttons - Mobile Bottom */}
            <div className="lg:hidden space-y-2">
              {event.website_url && (
                <a
                  href={`https://${event.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg text-sm hover:bg-gray-800"
                >
                  Visit Website <FiArrowUpRight />
                </a>
              )}

              <OutlinedShareBtn
                title={event.title}
                address={event.address.full_address}
                eventCode={event.event_code}
              />

              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg text-sm hover:bg-gray-800"
              >
                <FiMail /> Contact Organizer
              </button>
            </div>

            {/* Capacity */}
            {event.capacity && (
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-3 md:mb-4 text-gray-800">
                  Event Capacity
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Available</span>
                    <span>
                      {event.capacity - (attendanceCount ?? 0)} remaining
                    </span>
                  </div>
                  <div className="relative pt-1">
                    <div className="overflow-hidden h-2 bg-gray-200 rounded-full">
                      <div
                        className="h-2 bg-gray-800 rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            ((attendanceCount ?? 0) / event.capacity) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <EventsSlider
          heading="Similar Events"
          events={similarEvents ?? []}
          eventCategory={event.event_category}
        />
      </div>
    </div>
  );
}
