import { publicSupabase } from "@/config/supabase/publicClient";
import { normalizeEventRow } from "@abonten/core/eventAddress";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import { logger } from "@abonten/core/logger";
import { userFacingError } from "@abonten/core/userFacingError";
import type { UserPostType } from "@abonten/types/postsType";

/**
 * Events of the same category near a point, soonest first, without the
 * event being looked at. get_similar_events orders and limits the list
 * itself and returns the whole card (price, attendance, per-tier stock), so
 * this is one request. Public read: the cookie-free client.
 */
export async function getSimilarEvents(
  category: string,
  lng: number,
  lat: number,
  options: { excludeEventId?: string; limit?: number } = {},
): Promise<
  | { status: 200; similarEvents: UserPostType[] }
  | { status: 500; message: string; similarEvents?: undefined }
> {
  const { data, error } = await publicSupabase.rpc("get_similar_events", {
    input_category: category,
    input_location: `SRID=4326;POINT(${lng} ${lat})`,
    input_radius_km: 10,
    p_exclude_event_id: options.excludeEventId,
    // A small "similar events" row, not a full list page.
    p_limit: options.limit ?? 20,
  });

  if (error) {
    logger.error(error.message);

    return {
      status: 500,
      message: userFacingError("Error fetching similar events", error),
    };
  }

  const similarEvents: UserPostType[] = (data ?? []).map((row) =>
    withInlineEventAvailability(normalizeEventRow(row)),
  );

  return { status: 200, similarEvents };
}
