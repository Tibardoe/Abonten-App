import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";

// schema.org payloads for the two public listing pages. Only facts a
// signed-out visitor can already see on the page go in here.

type EventForJsonLd = {
  title: string;
  description: string | null;
  event_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  flyer_public_id: string | null;
  flyer_version: string | null;
  address: { full_address?: string } | null;
  event_occurrence: { starts_at: string; ends_at: string }[];
  ticket_type: {
    price: number;
    currency: string;
    quantity: number | null;
    available_from: string | null;
  }[];
  user_info: { username: string } | null;
  place: { name: string; slug: string } | null;
};

export function eventJsonLd(event: EventForJsonLd): Record<string, unknown> {
  const url = `${PUBLIC_SITE_ORIGIN}/events/${event.event_code}`;
  const sessions =
    event.event_occurrence.length > 0
      ? event.event_occurrence
      : [{ starts_at: event.starts_at, ends_at: event.ends_at }];
  const first = sessions.reduce((a, b) =>
    new Date(a.starts_at) < new Date(b.starts_at) ? a : b,
  );
  const last = sessions.reduce((a, b) =>
    new Date(a.ends_at) > new Date(b.ends_at) ? a : b,
  );
  const image =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 1200,
          height: 630,
        })
      : undefined;
  const address = event.address?.full_address;
  const offers = event.ticket_type.map((t) => ({
    "@type": "Offer",
    price: Number(t.price).toFixed(2),
    priceCurrency: t.currency || "GHS",
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
  address: { full_address?: string } | Record<string, unknown> | null;
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
  const address = (place.address as { full_address?: string } | null)
    ?.full_address;
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
