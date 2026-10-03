"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { requestTimeZone } from "@/utils/requestTimeZone";
import { normalizeEventRow } from "@abonten/core/eventAddress";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import type { EventFilters } from "@abonten/core/exploreFilters";
import {
  type ExploreEventSection,
  type ExploreEventSections,
  emptyExploreEventSections,
  exploreEventSectionArgs,
  splitExploreEventSections,
} from "@abonten/core/exploreSections";
import { logger } from "@abonten/core/logger";
import type { UserPostType } from "@abonten/types/postsType";

// A card row, plus the rows it belongs to and its place in each.
type SectionRow = UserPostType & { sections?: unknown };

/**
 * The Explore rows of events for an area (Featured, Around you, Happening
 * today / this week / this month, From top-rated organizers), each taken
 * from every event in the area and narrowed by the visitor's filters with
 * the same rule as the "All events" list. "Today" and "this month" are the
 * visitor's (their browser's zone), not the server's.
 *
 * Public read (get_explore_event_sections is granted to anon and never
 * looks at who is asking), so it uses the cookie-free client.
 */
export async function getExploreEventSections(input: {
  lat: number;
  lng: number;
  filters: EventFilters;
  sections?: readonly ExploreEventSection[];
  sectionSize?: number;
}): Promise<{ status: number; data: ExploreEventSections<UserPostType> }> {
  const zone = await requestTimeZone();

  const { data, error } = await publicSupabase.rpc(
    "get_explore_event_sections",
    exploreEventSectionArgs({ ...input, zone }),
  );

  if (error) {
    logger.error(`Error fetching the Explore event rows: ${error.message}`);
    return { status: 500, data: emptyExploreEventSections<UserPostType>() };
  }

  const rows: SectionRow[] = (data ?? []).map((row) =>
    withInlineEventAvailability(normalizeEventRow(row)),
  );

  return { status: 200, data: splitExploreEventSections(rows) };
}
