import { supabase } from "@/lib/supabase";
import { getFeaturedEvents } from "@abonten/core/dailyEventCache";
import { filterEventsByWindow } from "@abonten/core/eventDateWindow";
import type { UserPostType } from "@abonten/types/postsType";
import { useQuery } from "@tanstack/react-query";

// The Explore Events tab's curated sliders — the native echo of the web
// EventsTabContent. Every slider is derived from ONE bounded
// `get_nearby_events` fetch (10km, matching the web
// getNearByEvents(lat,lng,10000) call) plus the active-promotion id set,
// exactly like the web page's Promise.all. Only the "All events" list (a
// separate infinite query) honours the filter sheet — these keep their
// fixed curated semantics, same split as web.

const NEARBY_RADIUS_KM = 10;
const NEARBY_LIMIT = 60;

async function fetchNearby(lat: number, lng: number): Promise<UserPostType[]> {
  const { data, error } = await supabase.rpc("get_nearby_events", {
    user_lat: lat,
    user_lng: lng,
    search_radius: NEARBY_RADIUS_KM,
    p_cursor_sort_key: null,
    p_cursor_id: null,
    p_page_size: NEARBY_LIMIT,
  });
  if (error) throw error;
  return (data ?? []) as UserPostType[];
}

async function fetchPromotedIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("event_promotion")
    .select("event_id")
    .gt("ends_at", new Date().toISOString());
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { event_id: string }).event_id));
}

export type EventSliders = {
  featured: UserPostType[];
  aroundYou: UserPostType[];
  topRatedOrganizers: UserPostType[];
  happeningToday: UserPostType[];
  happeningThisWeek: UserPostType[];
  happeningThisMonth: UserPostType[];
};

const EMPTY: EventSliders = {
  featured: [],
  aroundYou: [],
  topRatedOrganizers: [],
  happeningToday: [],
  happeningThisWeek: [],
  happeningThisMonth: [],
};

export function useExploreEventSliders(
  coords: { lat: number; lng: number } | null,
  locationLabel: string,
) {
  const query = useQuery({
    queryKey: ["explore", "event-sliders", coords?.lat ?? 0, coords?.lng ?? 0],
    enabled: coords != null,
    queryFn: async (): Promise<EventSliders> => {
      const [events, promotedIds] = await Promise.all([
        fetchNearby(coords?.lat ?? 0, coords?.lng ?? 0),
        fetchPromotedIds().catch(() => new Set<string>()),
      ]);

      // A paid promotion makes an event featured-eligible, same fold-in as
      // the web page (before getFeaturedEvents runs).
      const withPromotion = promotedIds.size
        ? events.map((e) =>
            promotedIds.has(e.id) ? { ...e, featured: true } : e,
          )
        : events;

      return {
        featured: getFeaturedEvents(withPromotion, locationLabel),
        aroundYou: events,
        topRatedOrganizers: filterEventsByWindow(
          events,
          "top-rated-organizers",
        ),
        happeningToday: filterEventsByWindow(events, "happening-today"),
        happeningThisWeek: filterEventsByWindow(events, "happening-this-week"),
        happeningThisMonth: filterEventsByWindow(
          events,
          "happening-this-month",
        ),
      };
    },
  });

  return { ...query, data: query.data ?? EMPTY };
}
