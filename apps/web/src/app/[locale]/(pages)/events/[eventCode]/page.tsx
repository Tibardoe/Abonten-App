import { getSimilarEvents } from "@/actions/getSimilarEvents";
import { getUserRating } from "@/actions/getUserRating";
import GetDirectionBtn from "@/components/atoms/GetDirectionBtn";
import OutlinedShareBtn from "@/components/atoms/OutlinedShareBtn";
import ReportButton from "@/components/atoms/ReportButton";
import {
  EventAttendanceHeroBadges,
  EventCapacityCard,
} from "@/components/molecules/EventAttendanceStats";
import EventDateSelector from "@/components/molecules/EventDateSelector";
import EventStatusBanner from "@/components/molecules/EventStatusBanner";
import LocationMapPreview from "@/components/molecules/LocationMapPreview";
import EventsSlider from "@/components/organisms/EventsSlider";
import { CardTitle, SectionTitle } from "@/components/ui/typography";
import { publicSupabase } from "@/config/supabase/publicClient";
import AddEventReviewButton from "@/events/molecules/AddEventReviewButton";
import { MessageSubjectButton } from "@/messaging/components/MessageSubjectButton";
import { loadReviewPreview } from "@/reviews/loadReviews";
import ReviewsPreview from "@/reviews/organisms/ReviewsPreview";
import { eventCategoryLabel } from "@abonten/core/categoryLabels";
import {
  buildAvatarUrl,
  buildCloudinaryUrl,
} from "@abonten/core/cloudinaryUrl";
import {
  getFormattedEventDate,
  getRelativeTime,
} from "@abonten/core/dateFormatter";
import { readEventAddress } from "@abonten/core/eventAddress";
import { formatMoney } from "@abonten/core/formatMoney";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import { asWkbHex, parseWKBHex } from "@abonten/core/parseWKBHex";
import { hasFreeRegistration } from "@abonten/core/ticketTiers";
import type { UserPostType } from "@abonten/types/postsType";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowUpRight } from "react-icons/fi";
import { IoLocationOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import { PiTicketBold } from "react-icons/pi";

import JsonLd from "@/components/atoms/JsonLd";
import { eventJsonLd } from "@/utils/structuredData";
import VerifiedBadgePopover from "@/verification/molecules/VerifiedBadgePopover";
import { getLocale, getTranslations } from "next-intl/server";
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Event details are public and don't depend on the viewer, so this page can
// be statically rendered and revalidated periodically (ISR) instead of
// re-querying Supabase on every request. 60s balances freshness (ticket
// price/attendance/sold-out status shown here are display-only — checkout
// re-validates stock live) against not hitting the DB on every hit.
export const revalidate = 60;

// Rich link previews when an event is shared (from web or the mobile share
// sheet). The flyer is served straight from Cloudinary at OG dimensions —
// no ImageResponse route needed.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("events");

  const { eventCode } = await params;
  const { data: event } = await publicSupabase
    .from("event")
    .select("title, description, flyer_public_id, flyer_version")
    .eq("event_code", eventCode.toUpperCase())
    .single();

  // The segment layout has already answered with a 404 for a missing code.
  if (!event) return { title: t("eventNotFound") };

  const title = event.title;
  const description = event.description
    ? String(event.description).slice(0, 155)
    : undefined;
  const image =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 1200,
          height: 630,
        })
      : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function page({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const locale = await getLocale();

  const t = await getTranslations("events");
  const tc = await getTranslations("core");

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
    username,
    organizer_verified,
    status_id
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

  if (!event) notFound();

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
        [{ starts_at: event.starts_at ?? "", ends_at: event.ends_at ?? "" }];

  const address = readEventAddress(event.address);
  const eventId = event.id;
  const locationWkb = asWkbHex(event.location);
  // The event row carries its own coordinates. Before 2026-09-25 the page
  // geocoded the address text instead: a billed Google call per page, a
  // guess where the venue pin is exact, and an event with no address line
  // (structured address only) threw and took the whole page down.
  const { eventLat, eventLng } = parseWKBHex(locationWkb);
  const eventCoordinates = { lat: eventLat, lng: eventLng };

  // attendanceCount, minTicket, averageRating, and the geocode lookup only
  // depend on `event` (not on each other), so run them concurrently instead
  // of as four sequential round trips.
  const [
    { data: attendanceCountResult },
    { data: minTicket },
    averageRating,
    { lat, lng },
    reviewPreview,
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
    eventCoordinates,
    // The reviews block: summary + the three most helpful (never the
    // whole history — "See all" opens /events/<code>/reviews).
    loadReviewPreview("event", event.id),
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
  // No coordinates (an address Google does not know, or a lookup that timed
  // out) simply means no "similar events near here" section — never a
  // failed event page.
  const similarEventsResponse =
    lat === null || lng === null
      ? null
      : await getSimilarEvents(event.event_category, lng, lat);
  const similarEvents: UserPostType[] = (
    (similarEventsResponse?.similarEvents ?? []) as unknown as UserPostType[]
  ).filter((evt) => evt.id !== event.id);

  const postedAt = getRelativeTime(event.created_at, undefined, locale);
  const eventDateAndTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
    event.timezone,
    locale,
  );

  const tags = parseEventTypes(event.event_type);

  // Free registration = the FREE tier, the same test issue_free_ticket
  // applies (@abonten/core/ticketTiers).
  const isAbsolutelyFreeEvent = hasFreeRegistration(event.ticket_type);

  // "From" only when there is more than one price to choose from.
  const prices = (event.ticket_type ?? []).map((t: { price: number | null }) =>
    Number(t.price ?? 0),
  );
  const hasPriceRange = new Set(prices).size > 1;
  const lowestPrice =
    minTicket === null
      ? ""
      : formatMoney(minTicket?.currency, minTicket?.price, {
          trimZeroFraction: true,
          locale,
        });
  const priceLabel =
    minTicket?.price === 0 || minTicket === null
      ? t("free")
      : hasPriceRange
        ? t("fromPrice", { price: lowestPrice })
        : lowestPrice;

  // Organizers type the address with or without the scheme.
  const websiteHref = event.website_url
    ? /^https?:\/\//i.test(event.website_url)
      ? event.website_url
      : `https://${event.website_url}`
    : null;

  const hasOrganizerRating = averageRating.totalRatings > 0;

  return (
    <div className="bg-background">
      <JsonLd data={eventJsonLd(event)} />
      {/* Hero Section */}
      <div className="relative h-72 md:h-[500px] bg-muted overflow-hidden md:rounded-2xl">
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
        <div className="absolute inset-0 bg-gradient-to-t from-overlay/85 via-overlay/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 space-y-2 md:space-y-4">
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-2xl text-balance">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="px-3 py-1.5 md:px-4 md:py-2 bg-black/30 backdrop-blur-sm rounded-full text-white flex items-center gap-2 text-sm md:text-base">
              <PiTicketBold className="text-white/80" />
              <span>{priceLabel}</span>
            </span>
            <span className="px-3 py-1.5 md:px-4 md:py-2 bg-black/30 backdrop-blur-sm rounded-full text-white flex items-center gap-2 text-sm md:text-base">
              <MdOutlineDateRange className="text-white/80" />
              <span>{eventDateAndTime.date}</span>
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

      {/* A cancelled, ended or started event says so above the fold, not
          only on the ticket button. */}
      <EventStatusBanner eventDates={event_dates} eventStatus={event.status} />

      {/* Main Content. One grid: on phones everything stacks with the ticket
          panel straight after the organizer, so buying never needs a long
          scroll; on wide screens the panel is a sticky right-hand column
          beside the details. */}
      <div className="max-w-7xl mx-auto px-2 lg:px-8 py-6 md:py-10">
        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Organizer Card */}
          <section className="lg:col-span-2 bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
            <div className="flex items-center gap-3 md:gap-4">
              <Link
                href={`/user/${event.user_info.username}/posts`}
                className="shrink-0 hover:scale-105 transition-transform"
              >
                <Image
                  src={buildAvatarUrl(
                    event.user_info.avatar_public_id,
                    event.user_info.avatar_version,
                    { width: 56, height: 56 },
                  )}
                  alt={event.user_info.username ?? t("organizer")}
                  width={56}
                  height={56}
                  className="rounded-full border-2 border-border"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("hostedBy")}
                </p>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Link
                    href={`/user/${event.user_info.username}/posts`}
                    className="text-lg font-semibold text-card-foreground truncate hover:underline"
                  >
                    {event.user_info.username}
                  </Link>
                  {event.user_info.organizer_verified &&
                  event.user_info.status_id === 1 ? (
                    <VerifiedBadgePopover subjectType="organizer" compact />
                  ) : null}
                </div>
                {/* No stars at all until someone has rated them: five grey
                    stars and "(0.0)" read as a bad rating. */}
                {hasOrganizerRating && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-0.5" aria-hidden>
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={`star-${i.toLocaleString()}`}
                          className={`text-sm ${
                            i < Math.floor(averageRating.averageRating)
                              ? "text-warning"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {averageRating.averageRating.toFixed(1)} (
                      {averageRating.totalRatings})
                    </span>
                  </div>
                )}
              </div>
              <span className="hidden sm:block text-sm text-muted-foreground shrink-0">
                {t("posted", { postedAt: postedAt })}
              </span>
            </div>
            <MessageSubjectButton
              input={{ type: "event", eventId: event.id }}
              ownerId={event.organizer_id}
              label={t("messageOrganizer")}
              className="mt-4 w-full sm:w-auto"
            />
          </section>

          {/* Ticket panel */}
          <aside
            id="tickets"
            aria-label={t("tickets")}
            className="lg:col-start-3 lg:row-start-1 lg:row-span-4 lg:sticky lg:top-28"
          >
            <div className="bg-card text-card-foreground rounded-xl border border-border p-4 md:p-6 shadow-sm space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">{t("tickets")}</p>
                <p className="text-2xl font-bold">{priceLabel}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {eventDateAndTime.date}
                  <br />
                  {eventDateAndTime.time}
                </p>
              </div>

              <EventDateSelector
                eventDates={event_dates}
                eventId={event.id}
                timeZone={event.timezone}
                time={eventDateAndTime.time}
                eventTitle={event.title}
                requireRegistration={event.require_registration}
                soldOut={soldOut}
                isAbsolutelyFreeEvent={isAbsolutelyFreeEvent}
                eventStatus={event.status}
              />

              {isAbsolutelyFreeEvent && !event.require_registration && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {t("freeEntryNoTicketOrRegistration")}
                </p>
              )}

              <EventCapacityCard
                eventId={event.id}
                capacity={event.capacity}
                ticketTypes={event.ticket_type}
                initialCount={attendanceCount}
              />

              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <OutlinedShareBtn
                  title={event.title}
                  address={address.full_address}
                  eventCode={event.event_code}
                  eventId={event.id}
                />
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 border border-border bg-background py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
                  >
                    {t("website")} <FiArrowUpRight className="text-base" />
                  </a>
                )}
              </div>

              <div className="flex justify-center">
                <ReportButton
                  targetType="event"
                  targetId={event.id}
                  targetLabel={event.title}
                  ownerId={event.organizer_id}
                />
              </div>
            </div>
          </aside>

          {/* Description */}
          <section className="lg:col-span-2 bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
            <SectionTitle className="mb-3 md:mb-4 text-card-foreground">
              {t("aboutThisEvent")}
            </SectionTitle>
            <p className="text-muted-foreground leading-relaxed text-sm md:text-base whitespace-pre-line">
              {event.description}
            </p>
          </section>

          {/* When and where */}
          <section className="lg:col-span-2 bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm space-y-5">
            <SectionTitle className="text-card-foreground">
              {t("whenAndWhere")}
            </SectionTitle>

            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <MdOutlineDateRange className="text-xl text-foreground" />
              </span>
              <div>
                <CardTitle>{eventDateAndTime.date}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {eventDateAndTime.time}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <IoLocationOutline className="text-xl text-foreground" />
              </span>
              <div className="min-w-0">
                <CardTitle>{event.place?.name ?? t("location")}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {address.full_address}
                </p>
                {event.place && (
                  <Link
                    href={`/places/${event.place.slug}`}
                    className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    {t("seeTheVenue")}
                  </Link>
                )}
              </div>
            </div>

            <LocationMapPreview location={locationWkb} />
            <GetDirectionBtn location={locationWkb} />
          </section>

          {/* Category and tags */}
          <section className="lg:col-span-2 bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
            <SectionTitle className="mb-3 text-card-foreground">
              {t("goodToKnow")}
            </SectionTitle>
            <div className="flex flex-wrap gap-2">
              {event.event_category && (
                <span className="px-3 py-1 rounded-full bg-primary/10 text-sm font-medium text-foreground">
                  {eventCategoryLabel(tc, event.event_category)}
                </span>
              )}
              {tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-6 md:mt-8">
          <ReviewsPreview
            subject={{
              kind: "event",
              id: event.id,
              slug: event.event_code,
              title: event.title,
              ownerId: event.organizer_id,
            }}
            initialSummary={reviewPreview.summary}
            initialReviews={reviewPreview.reviews}
            addReviewButton={
              <AddEventReviewButton
                eventId={event.id}
                organizerId={event.organizer_id}
                eventStatus={event.status}
                startsAt={event.starts_at}
                endsAt={event.ends_at}
                occurrences={event.event_occurrence}
              />
            }
          />
        </div>

        <div className="mt-6 md:mt-8">
          <EventsSlider
            heading={t("similarEvents")}
            events={similarEvents ?? []}
            eventCategory={event.event_category}
          />
        </div>
      </div>
    </div>
  );
}
