import { withEventAttendanceCounts } from "@/lib/eventAttendance";
import { supabase } from "@/lib/supabase";
import type { UserPostType } from "@abonten/types/postsType";
import { useQuery } from "@tanstack/react-query";
import type { Coords } from "./useGeocode";

// Native echo of the web getSimilarEvents action: the anon-granted
// get_similar_events RPC, category + a 10km radius around the event's
// location. Its rows carry ticket_price / ticket_currency (not
// min_price / currency), so map those the same way the web action does for
// EventCard. Live attendance is merged in the same second batched RPC call
// the web action makes, so the rail's cards show real "going" / spots-left.

const RADIUS_KM = 10;

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
      const { data, error } = await supabase
        .rpc("get_similar_events", {
          input_category: category as string,
          input_location: `SRID=4326;POINT(${coords?.lng} ${coords?.lat})`,
          input_radius_km: RADIUS_KM,
        })
        .limit(20);
      if (error) throw error;
      const rows = ((data ?? []) as Record<string, unknown>[])
        .filter((e) => e.id !== eventId)
        .map(
          (e) =>
            ({
              ...e,
              min_price: e.ticket_price,
              currency: e.ticket_currency,
            }) as unknown as UserPostType,
        );
      return withEventAttendanceCounts(rows);
    },
  });
}
