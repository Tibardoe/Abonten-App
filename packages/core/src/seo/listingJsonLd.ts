import { PUBLIC_SITE_ORIGIN } from "../brand/socialLinks";
import { buildCloudinaryUrl } from "../cloudinaryUrl";
import { readEventAddress } from "../eventAddress";
import { fromMajor, toMajorString } from "../money/money";
import { hasFreeRegistration } from "../ticketTiers";
import {
  type OpeningHoursRow,
  openingHoursSpecification,
  placeSchemaType,
  plainProfileUrl,
  postalAddress,
} from "./jsonLd";
import { eventPath, placePath, profilePath } from "./paths";

// schema.org payloads for the public event and place pages (Google's event
// and local-business results read them). Only facts a signed-out visitor
// can already see on the page go in.

/** How many dates of a multi-date event are described, soonest first. */
export const MAX_EVENT_SESSIONS = 10;

/** The 16:9, 4:3 and 1:1 crops Google asks for, from one Cloudinary image. */
function imageSet(
  publicId: string | null | undefined,
  version: string | null | undefined,
): string[] | undefined {
  if (!publicId || !version) return undefined;
  return [
    [1200, 675],
    [1200, 900],
    [1200, 1200],
  ].map(([width, height]) =>
    buildCloudinaryUrl(publicId, version, { width, height }),
  );
}

function geoOf(lat?: number | null, lng?: number | null) {
  return typeof lat === "number" && typeof lng === "number"
    ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng }
    : undefined;
}

type Session = { starts_at: string; ends_at: string };

/**
 * The dates to describe. A one-date event is that date. An event with
 * several is each date still to come, soonest first (a series is several
 * events to a search engine, not one that lasts weeks); once every date is
 * over, the last one.
 */
export function eventSessions(
  startsAt: string | null,
  endsAt: string | null,
  occurrences: { starts_at: string | null; ends_at: string | null }[],
  now: Date = new Date(),
): Session[] {
  const candidates =
    occurrences.length > 0
      ? occurrences
      : [{ starts_at: startsAt, ends_at: endsAt }];
  const sessions = candidates
    .flatMap((s) =>
      s.starts_at && s.ends_at
        ? [{ starts_at: s.starts_at, ends_at: s.ends_at }]
        : [],
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  if (sessions.length <= 1) return sessions;
  const upcoming = sessions.filter((s) => Date.parse(s.ends_at) >= +now);
  return upcoming.length > 0
    ? upcoming.slice(0, MAX_EVENT_SESSIONS)
    : sessions.slice(-1);
}

export type EventForJsonLd = {
  title: string;
  description: string | null;
  event_code: string;
  status: string;
  // Null for a multi-date event, whose sessions are the occurrences.
  starts_at: string | null;
  ends_at: string | null;
  flyer_public_id: string | null;
  flyer_version: string | null;
  address: unknown;
  country_code?: string | null;
  /** The event's currency (every tier carries it). */
  currency?: string | null;
  require_registration?: boolean | null;
  event_occurrence: { starts_at: string | null; ends_at: string | null }[];
  ticket_type: {
    type?: string | null;
    price: number | null;
    currency: string | null;
    quantity: number | null;
    available_from: string | null;
    available_until?: string | null;
  }[];
  user_info: { username: string | null; full_name?: string | null } | null;
  place: { name: string; slug: string } | null;
};

export type EventJsonLdContext = {
  /** The city the event is in, when it is inside one of the market's cities. */
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Every tier is gone (capacity or quantities), as the page shows it. */
  soldOut?: boolean;
  now?: Date;
};

/** One schema.org Event per date described (see eventSessions). */
export function eventJsonLd(
  event: EventForJsonLd,
  context: EventJsonLdContext = {},
): Record<string, unknown>[] {
  const sessions = eventSessions(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
    context.now,
  );
  if (sessions.length === 0) return [];

  const url = `${PUBLIC_SITE_ORIGIN}${eventPath(event.event_code)}`;
  const addressLine = readEventAddress(event.address).full_address;
  const address = postalAddress({
    line: addressLine,
    city: context.city,
    countryCode: event.country_code,
  });
  const geo = geoOf(context.lat, context.lng);
  const location = {
    "@type": "Place",
    name: event.place?.name || addressLine || context.city || event.title,
    ...(event.place
      ? { url: `${PUBLIC_SITE_ORIGIN}${placePath(event.place.slug)}` }
      : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
  };

  const offers = event.ticket_type.flatMap((t) => {
    const currency = t.currency || event.currency;
    if (!currency) return [];
    const gone = context.soldOut || (t.quantity !== null && t.quantity <= 0);
    return [
      {
        "@type": "Offer",
        // A plain decimal in the currency's own precision ("1500" for yen,
        // "25.00" for cedis).
        price: toMajorString(fromMajor(Number(t.price ?? 0), currency)),
        priceCurrency: currency,
        url,
        availability: gone
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock",
        ...(t.available_from ? { validFrom: t.available_from } : {}),
        ...(t.available_until ? { availabilityEnds: t.available_until } : {}),
      },
    ];
  });
  // Free to attend: the FREE tier, or no tiers and no registration (walk in).
  const free =
    hasFreeRegistration(
      event.ticket_type.map((t) => ({ type: t.type ?? null })),
    ) ||
    (event.ticket_type.length === 0 && !event.require_registration);

  const organizerName =
    event.user_info?.full_name?.trim() || event.user_info?.username;
  const organizer =
    event.user_info?.username && organizerName
      ? {
          "@type": "Organization",
          name: organizerName,
          url: `${PUBLIC_SITE_ORIGIN}${profilePath(event.user_info.username)}`,
        }
      : undefined;
  const image = imageSet(event.flyer_public_id, event.flyer_version);

  return sessions.map((session) => ({
    "@type": "Event",
    name: event.title,
    ...(event.description ? { description: event.description } : {}),
    url,
    ...(image ? { image } : {}),
    startDate: session.starts_at,
    endDate: session.ends_at,
    eventStatus:
      event.status === "canceled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location,
    ...(organizer ? { organizer } : {}),
    ...(offers.length > 0 ? { offers } : {}),
    ...(free ? { isAccessibleForFree: true } : {}),
  }));
}

export type PlaceForJsonLd = {
  name: string;
  slug: string;
  description: string | null;
  address: unknown;
  country_code?: string | null;
  phone: string | null;
  website_url: string | null;
  social_links?: unknown;
  cover_public_id: string | null;
  cover_version: string | null;
  place_category: { name: string; slug?: string | null } | null;
  openingHours?: OpeningHoursRow[];
  avgRating: number;
  reviewCount: number;
  lat?: number | null;
  lng?: number | null;
};

/** The place's own web addresses (its site, then its social profiles). */
function placeLinks(place: PlaceForJsonLd): string[] {
  const links: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      links.push(plainProfileUrl(new URL(href).toString()));
    } catch {
      // Not an address; nothing to point at.
    }
  };
  if (place.website_url?.trim()) add(place.website_url.trim());
  const social = place.social_links;
  if (social && typeof social === "object") {
    for (const value of Object.values(social as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) add(value.trim());
    }
  }
  return [...new Set(links)];
}

export function placeJsonLd(
  place: PlaceForJsonLd,
  context: { city?: string | null } = {},
): Record<string, unknown> {
  const url = `${PUBLIC_SITE_ORIGIN}${placePath(place.slug)}`;
  const image = imageSet(place.cover_public_id, place.cover_version);
  const address = postalAddress({
    line: readEventAddress(place.address).full_address,
    city: context.city,
    countryCode: place.country_code,
  });
  const geo = geoOf(place.lat, place.lng);
  const hours = openingHoursSpecification(place.openingHours ?? []);
  const sameAs = placeLinks(place);
  return {
    "@type": placeSchemaType(place.place_category?.slug),
    "@id": `${url}#place`,
    name: place.name,
    url,
    ...(place.description ? { description: place.description } : {}),
    ...(image ? { image } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(place.phone ? { telephone: place.phone } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(hours.length > 0 ? { openingHoursSpecification: hours } : {}),
    ...(place.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: place.avgRating,
            reviewCount: place.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
