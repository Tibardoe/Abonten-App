import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

// Listings for the search suites: published events and places near Osu,
// made through the same paths the product uses, and the two searches the
// assertions read. Each suite keeps its own token in the titles so it only
// compares its own fixtures with each other.

const LAT = 5.6037;
const LNG = -0.187;

export type SearchFixtures = {
  eventIds: string[];
  placeIds: string[];
  makeEvent(opts: {
    title: string;
    description?: string;
    category?: string;
    startsAt: Date;
  }): Promise<string>;
  makePlace(name: string, description: string): Promise<string>;
  /** Deletes every listing made here. */
  cleanup(): Promise<void>;
};

export function createSearchFixtures(
  svc: ServiceRoleClient,
  organizerId: () => string,
): SearchFixtures {
  const eventIds: string[] = [];
  const placeIds: string[] = [];

  return {
    eventIds,
    placeIds,

    async makeEvent(opts) {
      const { data, error } = await svc.rpc("create_event", {
        p_client_request_id: crypto.randomUUID(),
        p_organizer_id: organizerId(),
        p_title: opts.title,
        p_slug: `${opts.title.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
        p_description:
          opts.description ??
          "An integration test event with a long enough description to count as complete.",
        p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
        p_event_category: opts.category ?? "Music & Concerts",
        p_event_type: ["Live Concerts"],
        p_latitude: LAT,
        p_longitude: LNG,
        p_address: { full_address: "Osu, Accra, Ghana" },
        p_capacity: 100,
        p_website_url: null,
        p_flyer_public_id: "test/flyer",
        p_flyer_version: "1",
        p_starts_at: opts.startsAt.toISOString(),
        p_ends_at: new Date(
          opts.startsAt.getTime() + 4 * 3_600_000,
        ).toISOString(),
        p_require_registration: false,
        p_featured: false,
        p_specific_dates: null,
        p_ticket_types: [
          {
            type: "General",
            price: 50,
            currency: "GHS",
            quantity: 50,
            available_from: null,
            available_until: null,
          },
        ],
        p_promo_codes: null,
        p_receiving_account: null,
        p_place_id: null,
      } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
      if (error || !data)
        throw new Error(`create_event failed: ${error?.message}`);
      const id = data as unknown as string;
      eventIds.push(id);
      await svc.from("event").update({ status: "published" }).eq("id", id);
      return id;
    },

    async makePlace(name, description) {
      const { data, error } = await svc
        .from("place")
        .insert({
          country_code: "GH",
          timezone: "Africa/Accra",
          owner_id: organizerId(),
          name,
          slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
          description,
          category_id: 1,
          location: `SRID=4326;POINT(${LNG} ${LAT})`,
          address: { full_address: "Oxford Street, Osu, Accra" },
          cover_public_id: "test/cover",
          cover_version: "1",
          status: "published",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`place insert failed: ${error.message}`);
      placeIds.push(data.id);
      return data.id;
    },

    async cleanup() {
      if (eventIds.length) await svc.from("event").delete().in("id", eventIds);
      if (placeIds.length) await svc.from("place").delete().in("id", placeIds);
    },
  };
}

export async function eventIdsFor(
  client: SupabaseClient<Database>,
  query: string,
): Promise<string[]> {
  const { data, error } = await client.rpc("search_events", {
    p_query: query,
    p_page_size: 50,
  });
  expect(error).toBeNull();
  return (data ?? []).map((r) => r.id);
}

export async function placeIdsFor(
  client: SupabaseClient<Database>,
  query: string,
): Promise<string[]> {
  const { data, error } = await client.rpc("search_places", {
    p_query: query,
    p_page_size: 50,
  });
  expect(error).toBeNull();
  return (data ?? []).map((r) => r.id);
}

/**
 * A moment inside the window a search reads for `month` (1-12): the 12th at
 * 18:00 Accra of its next occurrence, or, while that month is running, an
 * hour from now (a search in December reads the rest of this December, not
 * next year's).
 */
export function nextInMonth(month: number): Date {
  const now = new Date();
  const year = now.getUTCFullYear();
  const current = now.getUTCMonth() + 1;
  if (current === month) {
    const monthEnd = Date.UTC(year, month, 1);
    return new Date(Math.min(now.getTime() + 3_600_000, monthEnd - 60_000));
  }
  return new Date(
    Date.UTC(month < current ? year + 1 : year, month - 1, 12, 18),
  );
}
