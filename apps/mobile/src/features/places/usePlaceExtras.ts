import { supabase } from "@/lib/supabase";
import type { UserPostType } from "@abonten/types/postsType";
import { useQuery } from "@tanstack/react-query";

function cheapest(
  tickets: { price: number | null; currency: string | null }[],
): { min_price: number | null; currency: string | null } {
  const priced = tickets.filter(
    (t): t is { price: number; currency: string | null } => t.price != null,
  );
  if (priced.length === 0) return { min_price: null, currency: null };
  const low = priced.reduce((m, t) => (t.price < m.price ? t : m));
  return { min_price: low.price, currency: low.currency };
}

// Native echo of the web place-detail extras:
// - getPlaceUpcomingEvents -> usePlaceUpcomingEvents
// `event` is anon-readable where status='published'. (A place's reviews are
// @/features/reviews/useReviews.)

export function usePlaceUpcomingEvents(placeId: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "place-upcoming-events", placeId],
    enabled: !!placeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event")
        .select(
          "*, ticket_type(id, type, price, currency), occurrences:event_occurrence(*)",
        )
        .eq("place_id", placeId as string)
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(12);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((e) => {
        const { min_price, currency } = cheapest(
          (e.ticket_type ?? []) as {
            price: number | null;
            currency: string | null;
          }[],
        );
        return { ...e, min_price, currency } as unknown as UserPostType;
      });
    },
  });
}
