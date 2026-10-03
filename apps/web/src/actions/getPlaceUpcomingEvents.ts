"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import { normalizeEventRow } from "@abonten/core/eventAddress";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { UserPostType } from "@abonten/types/postsType";

// The events at a place that are still on, soonest first. Public read (no
// auth check), same "browsable signed-out" reasoning as getQueriedEvents.ts
// and getNearByEvents.ts.
//
// get_place_events decides "still on" by the rule every event list uses, so
// an event with several dates and one that has already begun are listed
// here too (a plain read of `event` asking for a start in the future missed
// both), and the row is the whole card: price, attendance, per-tier stock.
export const getPlaceUpcomingEvents = withActionLocale(
  async function getPlaceUpcomingEvents(placeId: string) {
    const { data, error } = await publicSupabase.rpc("get_place_events", {
      p_place_id: placeId,
      p_limit: 24,
    });

    if (error) {
      logger.error(`Error fetching place's upcoming events: ${error.message}`);
      return {
        status: 500,
        data: [],
        message: tr("somethingWentWrong"),
      };
    }

    const events: UserPostType[] = (data ?? []).map((row) =>
      withInlineEventAvailability(normalizeEventRow(row)),
    );

    return { status: 200, data: events };
  },
);
