import { NotFoundError } from "@/lib/queryErrors";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";
import { parseRatingAggregate, roundRating } from "@abonten/core/ratings";
import { useQuery } from "@tanstack/react-query";

// Same select shape the web event detail page (`events/[eventCode]/page.tsx`)
// runs against `publicSupabase`, minus the reviews/similar-events extras the
// mobile screen doesn't show yet. `event` RLS allows a direct read of
// published/canceled events, so no RPC or endpoint is needed.
const EVENT_DETAIL_SELECT = `
  *,
  user_info!organizer_id ( avatar_public_id, avatar_version, username ),
  ticket_type ( id, type, price, currency, quantity, available_from, available_until ),
  event_occurrence ( id, starts_at, ends_at ),
  place:place_id ( id, name, slug )
`;

export type EventDetail = {
  id: string;
  title: string;
  description: string;
  event_category: string;
  event_type: string;
  address: { full_address?: string } | null;
  website_url: string | null;
  capacity: number | null;
  flyer_public_id: string;
  flyer_version: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  event_code: string;
  created_at: string;
  organizer_id: string;
  user_info: {
    avatar_public_id: string;
    avatar_version: string;
    username: string;
  } | null;
  ticket_type: {
    id: string;
    type: string;
    price: number;
    currency: string;
    quantity: number | null;
    available_from: string | null;
    available_until: string | null;
  }[];
  event_occurrence: { id: string; starts_at: string; ends_at: string }[];
  place: { id: string; name: string; slug: string } | null;
};

export type OrganizerRating = { average: number; count: number };

async function fetchEventDetail(id: string): Promise<{
  event: EventDetail;
  attendanceCount: number;
  organizerRating: OrganizerRating;
}> {
  if (!isUuid(id)) throw new NotFoundError("Event");

  const { data, error } = await supabase
    .from("event")
    .select(EVENT_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError("Event");

  const event = data as unknown as EventDetail;

  // `attendance` RLS only exposes a viewer's own rows, so a direct count
  // would under-report. get_event_attendance_count is the narrow public
  // SECURITY DEFINER aggregate the web page uses for the same reason.
  const { data: count } = await supabase.rpc("get_event_attendance_count", {
    p_event_id: event.id,
  });

  // Same as the web page's getUserRating(organizer_id): the organizer rated
  // as a person via the generic `review` table. Aggregated in Postgres
  // (get_user_rating, SECURITY INVOKER + anon-granted) rather than pulling
  // every review row for that organizer onto the device.
  const { data: ratingRow } = await supabase
    .rpc("get_user_rating", { p_reviewed_id: event.organizer_id })
    .maybeSingle();
  const parsed = parseRatingAggregate(ratingRow);
  const organizerRating: OrganizerRating = {
    count: parsed.count,
    average: roundRating(parsed.average),
  };

  return { event, attendanceCount: Number(count ?? 0), organizerRating };
}

export function useEventDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "event", id],
    enabled: !!id,
    queryFn: () => fetchEventDetail(id ?? ""),
  });
}
