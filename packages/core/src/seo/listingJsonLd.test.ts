import { describe, expect, it } from "vitest";
import {
  type EventForJsonLd,
  MAX_EVENT_SESSIONS,
  eventJsonLd,
  eventSessions,
  placeJsonLd,
} from "./listingJsonLd";
import { eventPath } from "./paths";

const NOW = new Date("2026-11-01T00:00:00Z");

function event(overrides: Partial<EventForJsonLd> = {}): EventForJsonLd {
  return {
    title: "Laugh Out Loud",
    description: "Stand-up comedy.",
    event_code: "LO6288",
    status: "published",
    starts_at: "2026-11-06T20:00:00+00:00",
    ends_at: "2026-11-06T23:00:00+00:00",
    flyer_public_id: "event_flyers/abc",
    flyer_version: "1",
    address: { full_address: "Osu, Accra, Ghana" },
    country_code: "GH",
    currency: "GHS",
    event_occurrence: [],
    ticket_type: [
      {
        type: "REGULAR",
        price: 80,
        currency: "GHS",
        quantity: 100,
        available_from: null,
        available_until: "2026-11-06T18:00:00+00:00",
      },
    ],
    user_info: { username: "lolghana", full_name: "LOL Ghana" },
    place: null,
    ...overrides,
  };
}

describe("eventPath", () => {
  it("is the lower-case code every link uses", () => {
    expect(eventPath("LO6288")).toBe("/events/lo6288");
  });
});

describe("eventSessions", () => {
  it("describes each date still to come of a multi-date event", () => {
    const occurrences = [
      { starts_at: "2026-10-30T20:00:00Z", ends_at: "2026-10-30T23:00:00Z" },
      { starts_at: "2026-11-13T20:00:00Z", ends_at: "2026-11-13T23:00:00Z" },
      { starts_at: "2026-11-06T20:00:00Z", ends_at: "2026-11-06T23:00:00Z" },
    ];
    expect(
      eventSessions(null, null, occurrences, NOW).map((s) => s.starts_at),
    ).toEqual(["2026-11-06T20:00:00Z", "2026-11-13T20:00:00Z"]);
  });

  it("keeps the last date once all are over, and caps a long series", () => {
    const past = [
      { starts_at: "2026-10-01T20:00:00Z", ends_at: "2026-10-01T23:00:00Z" },
      { starts_at: "2026-10-08T20:00:00Z", ends_at: "2026-10-08T23:00:00Z" },
    ];
    expect(eventSessions(null, null, past, NOW)).toEqual([past[1]]);
    const weekly = Array.from({ length: 20 }, (_, i) => ({
      starts_at: new Date(+NOW + (i + 1) * 7 * 86_400_000).toISOString(),
      ends_at: new Date(
        +NOW + (i + 1) * 7 * 86_400_000 + 3_600_000,
      ).toISOString(),
    }));
    expect(eventSessions(null, null, weekly, NOW)).toHaveLength(
      MAX_EVENT_SESSIONS,
    );
  });

  it("describes nothing when no date is complete", () => {
    expect(eventSessions(null, null, [], NOW)).toEqual([]);
  });
});

describe("eventJsonLd", () => {
  it("describes a paid event with its venue, organizer and offers", () => {
    const [node] = eventJsonLd(event(), {
      city: "Accra",
      lat: 5.55,
      lng: -0.18,
      now: NOW,
    });
    expect(node).toMatchObject({
      "@type": "Event",
      name: "Laugh Out Loud",
      url: "https://abontenhub.com/events/lo6288",
      startDate: "2026-11-06T20:00:00+00:00",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: "Osu, Accra, Ghana",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Osu, Accra, Ghana",
          addressLocality: "Accra",
          addressCountry: "GH",
        },
        geo: { latitude: 5.55, longitude: -0.18 },
      },
      organizer: {
        name: "LOL Ghana",
        url: "https://abontenhub.com/user/lolghana/posts",
      },
      offers: [
        {
          price: "80.00",
          priceCurrency: "GHS",
          availability: "https://schema.org/InStock",
          availabilityEnds: "2026-11-06T18:00:00+00:00",
        },
      ],
    });
    expect(node.image).toHaveLength(3);
    expect(node.isAccessibleForFree).toBeUndefined();
  });

  it("marks a free, sold-out or cancelled event as such", () => {
    const [free] = eventJsonLd(
      event({
        ticket_type: [
          {
            type: "FREE",
            price: 0,
            currency: "GHS",
            quantity: null,
            available_from: null,
          },
        ],
      }),
      { now: NOW },
    );
    expect(free.isAccessibleForFree).toBe(true);
    const [soldOut] = eventJsonLd(event(), { soldOut: true, now: NOW });
    expect((soldOut.offers as { availability: string }[])[0].availability).toBe(
      "https://schema.org/SoldOut",
    );
    const [cancelled] = eventJsonLd(event({ status: "canceled" }), {
      now: NOW,
    });
    expect(cancelled.eventStatus).toBe("https://schema.org/EventCancelled");
  });

  it("names the venue page when the event is at a listed place", () => {
    const [node] = eventJsonLd(
      event({ place: { name: "Republic Bar", slug: "republic-bar" } }),
      { now: NOW },
    );
    expect(node.location).toMatchObject({
      name: "Republic Bar",
      url: "https://abontenhub.com/places/republic-bar",
    });
  });

  it("describes nothing for an event without a complete date", () => {
    expect(eventJsonLd(event({ starts_at: null }), { now: NOW })).toEqual([]);
  });
});

describe("placeJsonLd", () => {
  it("describes a venue by its kind, address, hours and links", () => {
    const node = placeJsonLd(
      {
        name: "Republic Bar",
        slug: "republic-bar",
        description: "Cocktails and live bands.",
        address: { full_address: "Osu, Accra" },
        country_code: "GH",
        phone: "+233200000000",
        website_url: "republicbar.example",
        social_links: { instagram: "https://instagram.com/republic?utm=x" },
        cover_public_id: "covers/x",
        cover_version: "2",
        place_category: { name: "Pub", slug: "pub" },
        openingHours: [
          {
            day_of_week: 6,
            open_time: "18:00:00",
            close_time: "02:00:00",
            is_closed: false,
          },
        ],
        avgRating: 4.5,
        reviewCount: 12,
        lat: 5.55,
        lng: -0.18,
      },
      { city: "Accra" },
    );
    expect(node).toMatchObject({
      "@type": "BarOrPub",
      url: "https://abontenhub.com/places/republic-bar",
      address: { addressLocality: "Accra", addressCountry: "GH" },
      sameAs: [
        "https://republicbar.example/",
        "https://instagram.com/republic",
      ],
      aggregateRating: { ratingValue: 4.5, reviewCount: 12 },
    });
    expect(node.openingHoursSpecification).toHaveLength(1);
  });
});
