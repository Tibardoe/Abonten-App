import { getEventRating } from "@/actions/getEventRating";
import { getEventReviews } from "@/actions/getEventReviews";
import { getSimilarEvents } from "@/actions/getSimilarEvents";
import { getUserRating } from "@/actions/getUserRating";
import GetDirectionBtn from "@/components/atoms/GetDirectionBtn";
import OutlinedShareBtn from "@/components/atoms/OutlinedShareBtn";
import {
  EventAttendanceHeroBadges,
  EventCapacityCard,
} from "@/components/molecules/EventAttendanceStats";
import EventDateSelector from "@/components/molecules/EventDateSelector";
import EventsSlider from "@/components/organisms/EventsSlider";
import { publicSupabase } from "@/config/supabase/publicClient";
import EventReviewsSection from "@/events/organisms/EventReviewsSection";
import type { UserPostType } from "@/types/postsType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getFormattedEventDate, getRelativeTime } from "@/utils/dateFormatter";
import { geocodeAddress } from "@/utils/geocodeServerSide";
import { getEventSoldOutStatus } from "@/utils/getEventSoldOutStatus";
import { parseEventTypes } from "@/utils/parseEventTypes";
import Image from "next/image";
import Link from "next/link";
import { FiArrowUpRight, FiMail } from "react-icons/fi";
import { IoLocationOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import { PiTicketBold } from "react-icons/pi";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Event details are public and don't depend on the viewer, so this page can
// be statically rendered and revalidated periodically (ISR) instead of
// re-querying Supabase on every request. 60s balances freshness (ticket
// price/attendance/sold-out status shown here are display-only — checkout
// re-validates stock live) against not hitting the DB on every hit.
export const revalidate = 60;

export default async function page({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const supabase = publicSupabase;

  const { eventCode } = await params;

  const { data: event } = await supabase
    .from("event")
    .select(
      `
      *,
  user_info!organizer_id(
    avatar_public_id,
    avatar_version,
    username
  ),
  ticket_type(
    id,
    type,
    price,
    currency,
    quantity,
    available_from,
    available_until
  ),
  event_occurrence(
    id,
    starts_at,
    ends_at
  ),
  place:place_id(
    name,
    slug
  )
    `,
    )
    .eq("event_code", eventCode.toUpperCase())
    .single();

  if (!event) return <p className="p-8 text-center">No event found</p>;

  const event_dates =
    event.event_occurrence.length > 0
      ? event.event_occurrence
      : // Single-date events have no event_occurrence rows — synthesize one
        // pseudo-occurrence from the event's own dates. Deliberately no
        // `id`: this array's occurrence "id" flows downstream as the
        // occurrenceId sent to registerForFreeEvent/validateCheckout, which
        // validate it against the event's real event_occurrence rows — a
        // fabricated id here would fail that check with "Invalid event
        // date". EventDateSelector falls back to the array index for its
        // list key instead of relying on this id.
        [{ starts_at: event.starts_at, ends_at: event.ends_at }];

  const safeLocation = event.address.full_address ?? "";

  // attendanceCount, minTicket, averageRating, and the geocode lookup only
  // depend on `event` (not on each other), so run them concurrently instead
  // of as four sequential round trips.
  const [
    { data: attendanceCountResult },
    { data: minTicket },
    averageRating,
    { lat, lng },
    eventRating,
    eventReviewsFirstPage,
  ] = await Promise.all([
    // `attendance` has RLS restricting SELECT to the row's owner or the
    // event's organizer — this cookie-free publicSupabase client always has
    // auth.uid() = null, so a direct read here would always return zero
    // rows. get_event_attendance_count is a narrow SECURITY DEFINER RPC
    // that returns only the aggregate (sums number_of_tickets, only rows
    // still 'attending' — see 20260902120000_add_public_attendance_count_rpcs.sql).
    supabase.rpc("get_event_attendance_count", { p_event_id: event.id }),
    supabase
      .from("ticket_type")
      .select("id, type, price, currency")
      .eq("event_id", event.id)
      .order("price", { ascending: true })
      .limit(1)
      .single(),
    // Rates the organizer as a person (generic `review` table) — distinct
    // from eventRating below, which rates this specific event.
    getUserRating(event.organizer_id),
    geocodeAddress(safeLocation),
    getEventRating(event.id),
    getEventReviews(event.id),
  ]);

  const attendanceCount = Number(attendanceCountResult ?? 0);

  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: attendanceCount,
    ticketTypes: event.ticket_type,
  });

  // Similar events genuinely depend on the geocode result above, so this
  // stays sequential. Uses the same category-matching RPC as the dedicated
  // similar-events page instead of a separate nearby-events fetch + JS filter.
  const similarEventsResponse = await getSimilarEvents(
    event.event_category,
    lng,
    lat,
  );
  const similarEvents: UserPostType[] = (
    similarEventsResponse.similarEvents ?? []
  ).filter((evt: UserPostType) => evt.id !== event.id);

  const postedAt = getRelativeTime(event.created_at);
  const eventDateAndTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  const tags = parseEventTypes(event.event_type);

  async function fetchEventReviewsPage(cursor: string | null) {
    "use server";
    return getEventReviews(event.id, { cursor });
  }

  // Mutually exclusive at creation time (postEvent.ts either creates one
  // "FREE" ticket_type or only paid ones, and updateEvent.ts never touches
  // ticket_type afterwards) — so "every ticket_type is free" is a safe,
  // permanent definition rather than just checking the cheapest one.
  const isAbsolutelyFreeEvent =
    event.ticket_type.length > 0 &&
    event.ticket_type.every((t: { price: number }) => t.price === 0);

  return (
    <div className="bg-background">
      {/* Hero Section */}
      <div className="relative h-72 md:h-[500px] bg-muted">
        <Image
          src={buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
            width: 1280,
            height: 500,
          })}
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
            <EventAttendanceHeroBadges
              eventId={event.id}
              capacity={event.capacity}
              ticketTypes={event.ticket_type}
              initialCount={attendanceCount}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 lg:px-8 py-8 md:py-12">
        <div className="md:grid lg:grid-cols-3 gap-6 md:gap-8 flex flex-col mb-5">
          {/* Event Details */}
          <div className="lg:col-span-2 space-y-6 md:space-y-8">
            {/* Organizer Card */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <Link
                  href={`/user/${event.user_info.username}/posts`}
                  className="shrink-0 hover:scale-105 transition-transform"
                >
                  <Image
                    src={buildCloudinaryUrl(
                      event.user_info.avatar_public_id,
                      event.user_info.avatar_version,
                      { width: 56, height: 56 },
                    )}
                    alt={event.user_info.username}
                    width={56}
                    height={56}
                    className="rounded-full border-2 border-border"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/user/${event.user_info.username}/posts`}
                    className="text-lg font-medium text-card-foreground truncate"
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
                              ? "text-foreground"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      ({averageRating.averageRating.toFixed(1)})
                    </span>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground shrink-0">
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
                className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg text-sm hover:bg-primary/90 transition-colors"
              >
                <FiMail /> Contact
              </button>
            </div>

            {/* Event Info Grid */}
            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
              <div className="bg-card text-card-foreground p-4 md:p-6 rounded-xl shadow-sm">
                <div className="flex items-center gap-1 md:gap-4 mb-3 md:mb-4">
                  <IoLocationOutline className="text-xl md:text-2xl text-foreground" />
                  <h3 className="text-lg font-medium">Location</h3>
                </div>
                <p className="text-muted-foreground mb-4 text-sm md:text-base">
                  {event.address.full_address}
                </p>
                {event.place && (
                  <Link
                    href={`/places/${event.place.slug}`}
                    className="inline-block text-sm text-primary hover:underline mb-4"
                  >
                    📍 At: {event.place.name}
                  </Link>
                )}
                <GetDirectionBtn location={event.location} />
              </div>

              <div className="bg-card text-card-foreground p-4 md:p-6 rounded-xl shadow-sm">
                <div className="flex items-center gap-1 md:gap-4 mb-3 md:mb-4">
                  <MdOutlineDateRange className="text-xl md:text-2xl text-foreground" />
                  <h3 className="text-lg font-medium">Date & Time</h3>
                </div>
                <p className="text-muted-foreground text-sm md:text-base">
                  {eventDateAndTime.date}
                </p>
                <p className="text-muted-foreground text-sm md:text-base">
                  {eventDateAndTime.time}
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-xl md:text-2xl font-medium mb-3 md:mb-4 text-card-foreground">
                About the Event
              </h2>
              <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
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
                className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors"
              >
                <FiMail className="text-lg" /> Contact Organizer
              </button>
              {event.website_url && (
                <a
                  href={`https://${event.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Website <FiArrowUpRight className="text-lg" />
                </a>
              )}
            </div>

            {/* Ticket CTA */}
            <div className="bg-card rounded-xl shadow-lg hover:shadow-xl transition-all">
              <EventDateSelector
                eventDates={event_dates}
                eventId={event.id}
                time={eventDateAndTime.time}
                eventTitle={event.title}
                requireRegistration={event.require_registration}
                soldOut={soldOut}
                isAbsolutelyFreeEvent={isAbsolutelyFreeEvent}
                eventStatus={event.status}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 md:space-y-6">
            {/* Event Category */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <h3 className="text-lg font-medium mb-3 md:mb-4 text-card-foreground">
                Event Category
              </h3>
              <div className="flex">
                <span className="p-2 text-center border border-border w-full bg-muted text-muted-foreground rounded-full text-xs md:text-sm">
                  {event.event_category}
                </span>
              </div>
            </div>

            {/* Event Tags */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <h3 className="text-lg font-medium mb-3 md:mb-4 text-card-foreground">
                Event Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs md:text-sm"
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
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg text-sm hover:bg-primary/90"
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
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg text-sm hover:bg-primary/90"
              >
                <FiMail /> Contact Organizer
              </button>
            </div>

            {/* Capacity */}
            <EventCapacityCard
              eventId={event.id}
              capacity={event.capacity}
              ticketTypes={event.ticket_type}
              initialCount={attendanceCount}
            />
          </div>
        </div>

        <div className="mt-6 md:mt-8">
          <EventReviewsSection
            eventId={event.id}
            organizerId={event.organizer_id}
            eventStatus={event.status}
            startsAt={event.starts_at}
            endsAt={event.ends_at}
            occurrences={event.event_occurrence}
            avgRating={eventRating.averageRating}
            reviewCount={eventRating.totalRatings}
            initialPage={eventReviewsFirstPage}
            fetchPage={fetchEventReviewsPage}
          />
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
