import { supabase } from "@/lib/supabase";
import { getFeaturedEvents } from "@abonten/core/dailyEventCache";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import {
  EMPTY_EVENT_FILTERS,
  type EventFilters,
} from "@abonten/core/exploreFilters";
import {
  type ExploreEventSection,
  type ExploreEventSections,
  emptyExploreEventSections,
  exploreEventSectionArgs,
  splitExploreEventSections,
} from "@abonten/core/exploreSections";
import { viewerTimeZone } from "@abonten/core/time/timeZone";
import type { UserPostType } from "@abonten/types/postsType";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

// The Explore Events tab's rows — the native echo of the web
// EventsTabContent. One call (get_explore_event_sections) returns every
// row, each taken from all the events in the area, with the person's
// filters applied in the database by the same rule as the "All events" list
// below them. Featured is paid placement, not a search result: the filters
// do not touch it. "Today" and "this month" are the phone's calendar.
//
// The rows used to be cut on the phone from one list of the first 60
// nearby events, which came in no particular order: in a busy area
// "Happening today" could be empty on a day with events, and a promotion
// only reached Featured when its event happened to be among the 60.

export type EventSliders = ExploreEventSections<UserPostType>;

// A card row, plus the rows it belongs to and its place in each.
type SectionRow = UserPostType & { sections?: unknown };

const EMPTY: EventSliders = emptyExploreEventSections<UserPostType>();

export async function fetchExploreEventSections(input: {
  lat: number;
  lng: number;
  filters: EventFilters;
  sections?: readonly ExploreEventSection[];
  sectionSize?: number;
}): Promise<EventSliders> {
  const { data, error } = await supabase.rpc(
    "get_explore_event_sections",
    exploreEventSectionArgs({ ...input, zone: viewerTimeZone() }),
  );
  if (error) throw error;
  // The row is the whole card (price, attendance, per-tier stock), so the
  // cards need no second request. Its columns don't exactly match
  // UserPostType's app-level shape (address: Json, location: unknown) --
  // the same RPC-to-app-model boundary as the other discovery hooks.
  const rows = (data ?? []).map((row) =>
    withInlineEventAvailability(row),
  ) as unknown as SectionRow[];
  return splitExploreEventSections(rows);
}

export function useExploreEventSliders(
  coords: { lat: number; lng: number } | null,
  locationLabel: string,
  filters: EventFilters = EMPTY_EVENT_FILTERS,
) {
  const query = useQuery({
    queryKey: [
      "explore",
      "event-sliders",
      coords?.lat ?? 0,
      coords?.lng ?? 0,
      filters,
    ],
    enabled: coords != null,
    // A filter change asks again; the rows already on screen stay until
    // the answer is in, instead of blinking out.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EventSliders> => {
      const sections = await fetchExploreEventSections({
        lat: coords?.lat ?? 0,
        lng: coords?.lng ?? 0,
        filters,
      });
      return {
        ...sections,
        // Which paid placements show, and which leads, rotates daily.
        featured: getFeaturedEvents(sections.featured, locationLabel),
      };
    },
  });

  return { ...query, data: query.data ?? EMPTY };
}
