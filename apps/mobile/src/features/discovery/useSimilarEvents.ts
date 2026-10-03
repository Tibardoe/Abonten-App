import { supabase } from "@/lib/supabase";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import type { UserPostType } from "@abonten/types/postsType";
import { useQuery } from "@tanstack/react-query";
import type { Coords } from "./useGeocode";

// Native echo of the web getSimilarEvents action: the anon-granted
// get_similar_events RPC — the same category within 10 km of the event,
// soonest first, without the event being looked at. The function orders and
// limits the list itself and returns the whole card (price, attendance,
// per-tier stock), so the rail is one request.

const RADIUS_KM = 10;
const LIMIT = 20;

export function useSimilarEvents(
  eventId: string | undefined,
  category: string | undefined,
  coords: Coords | null | undefined,
) {
  return useQuery({
    queryKey: [
      "mobile",
      "similar-events",
      eventId,
      category,
      coords?.lat,
      coords?.lng,
    ],
    enabled: !!eventId && !!category && !!coords,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_similar_events", {
        input_category: category as string,
        input_location: `SRID=4326;POINT(${coords?.lng} ${coords?.lat})`,
        input_radius_km: RADIUS_KM,
        p_exclude_event_id: eventId,
        p_limit: LIMIT,
      });
      if (error) throw error;
      // Same RPC-to-app-model boundary as the other discovery hooks.
      return (data ?? []).map((row) =>
        withInlineEventAvailability(row),
      ) as unknown as UserPostType[];
    },
  });
}
