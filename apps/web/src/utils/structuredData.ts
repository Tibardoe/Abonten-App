import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { readEventAddress } from "@abonten/core/eventAddress";
import { fromMajor, toMajorString } from "@abonten/core/money/money";

// schema.org payloads for the two public listing pages. Only facts a
// signed-out visitor can already see on the page go in here.

type EventForJsonLd = {
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
  /** The event's currency (every tier carries it). */
  currency?: string | null;
  event_occurrence: { starts_at: string | null; ends_at: string | null }[];
  ticket_type: {
    price: number | null;
    currency: string | null;
    quantity: number | null;
    available_from: string | null;
  }[];
  user_info: { username: string | null } | null;
  place: { name: string; slug: string } | null;
};

export function eventJsonLd(event: EventForJsonLd): Record<string, unknown> {
  const url = `${PUBLIC_SITE_ORIGIN}/events/${event.event_code}`;
  const candidates =
    event.event_occurrence.length > 0
      ? event.event_occurrence
      : [{ starts_at: event.starts_at, ends_at: event.ends_at }];
  const sessions = candidates.flatMap((s) =>
    s.starts_at && s.ends_at
      ? [{ starts_at: s.starts_at, ends_at: s.ends_at }]
      : [],
  );
  const fallback = { starts_at: "", ends_at: "" };
  const first = sessions.reduce(
    (a, b) => (new Date(a.starts_at) < new Date(b.starts_at) ? a : b),
    sessions[0] ?? fallback,
  );
  const last = sessions.reduce(
    (a, b) => (new Date(a.ends_at) > new Date(b.ends_at) ? a : b),
    sessions[0] ?? fallback,
  );
  const image =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 1200,
          height: 630,
        })
      : undefined;
  const address = readEventAddress(event.address).full_address || undefined;
  const offers = event.ticket_type.map((t) => ({
    "@type": "Offer",
    // schema.org wants a plain decimal in the currency's own precision
    // ("1500" for yen, "25.00" for cedis).
    price:
      t.currency || event.currency
        ? toMajorString(
            fromMajor(
              Number(t.price ?? 0),
              (t.currency || event.currency) as string,
            ),
          )
        : Number(t.price ?? 0).toFixed(2),
    priceCurrency: t.currency || event.currency || undefined,
    url,
    availability:
      t.quantity !== null && t.quantity <= 0
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
    ...(t.available_from ? { validFrom: t.available_from } : {}),
  }));

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    ...(event.description ? { description: event.description } : {}),
    url,
    ...(image ? { image: [image] } : {}),
    startDate: first.starts_at,
    endDate: last.ends_at,
    eventStatus:
      event.status === "canceled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.place?.name ?? address ?? event.title,
      ...(address ? { address } : {}),
    },
    ...(event.user_info?.username
      ? {
          organizer: {
            "@type": "Organization",
            name: event.user_info.username,
            url: `${PUBLIC_SITE_ORIGIN}/user/${event.user_info.username}/posts`,
          },
        }
      : {}),
    ...(offers.length > 0 ? { offers } : {}),
  };
}

type PlaceForJsonLd = {
  name: string;
  slug: string;
  description: string | null;
  address: unknown;
  phone: string | null;
  website_url: string | null;
  cover_public_id: string | null;
  cover_version: string | null;
  place_category: { name: string } | null;
  avgRating: number;
  reviewCount: number;
  lat?: number | null;
  lng?: number | null;
};

export function placeJsonLd(place: PlaceForJsonLd): Record<string, unknown> {
  const url = `${PUBLIC_SITE_ORIGIN}/places/${place.slug}`;
  const image =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 1200,
          height: 630,
        })
      : undefined;
  const address = readEventAddress(place.address).full_address || undefined;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: place.name,
    url,
    ...(place.description ? { description: place.description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(address ? { address } : {}),
    ...(place.phone ? { telephone: place.phone } : {}),
    ...(place.website_url ? { sameAs: [place.website_url] } : {}),
    ...(place.place_category?.name
      ? { additionalType: place.place_category.name }
      : {}),
    ...(typeof place.lat === "number" && typeof place.lng === "number"
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: place.lat,
            longitude: place.lng,
          },
        }
      : {}),
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
