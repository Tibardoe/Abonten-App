import { getEventStatus } from "@abonten/core/eventStatus";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { logger } from "@abonten/core/logger";
import type { EventPromotionTier } from "@abonten/types/postsType";
import type { SupabaseClient } from "@supabase/supabase-js";

// Everything the Promotion tab of the per-event management screen needs, in
// one owner-scoped read — mirrors what manage/events/[eventId]/page.tsx
// assembles for ManageEventPromotionSection: the seeded tier list, whether
// the event is currently featured (always computed from ends_at > now, never
// stored), and whether a new promotion would be ineligible
// (cancelled / ended / sold out). Deliberately NOT a "use server" file.

export type EventPromotionContext = {
  tiers: EventPromotionTier[];
  currentPromotion: { ends_at: string; tierLabel: string | null } | null;
  eligibility: {
    eventStatus: string | null;
    ended: boolean;
    soldOut: boolean;
  };
};

export type EventPromotionContextResult =
  | { status: 403 | 404 | 500; message: string }
  | { status: 200; data: EventPromotionContext };

export async function fetchEventPromotionContext(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<EventPromotionContextResult> {
  const { data: event, error: eventError } = await supabase
    .from("event")
    .select(
      "id, organizer_id, status, starts_at, ends_at, capacity, event_occurrence(id, starts_at, ends_at), ticket_type(quantity)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: "Event not found" };
  }
  if (event.organizer_id !== userId) {
    return { status: 403, message: "Not authorized to promote this event" };
  }

  const nowIso = new Date().toISOString();

  const [
    { data: tierRows, error: tierError },
    { data: activePromo },
    { count: attendeeCount },
  ] = await Promise.all([
    supabase
      .from("event_promotion_tier")
      .select("*")
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("event_promotion")
      .select("ends_at, event_promotion_tier(duration_label)")
      .eq("event_id", eventId)
      .gt("ends_at", nowIso)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "attending"),
  ]);

  if (tierError) {
    logger.error(`Error fetching event promotion tiers: ${tierError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  // postgrest infers the embed as an array here (no generated types); it's a
  // single row at runtime — same workaround the web page uses.
  const promo = activePromo as unknown as {
    ends_at: string;
    event_promotion_tier: { duration_label: string } | null;
  } | null;

  const derivedStatus = getEventStatus(
    event.starts_at,
    event.ends_at,
    // biome-ignore lint/suspicious/noExplicitAny: untyped joined rows (see PROJECT.md)
    (event.event_occurrence ?? []) as any,
  );

  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: attendeeCount ?? 0,
    // biome-ignore lint/suspicious/noExplicitAny: untyped joined rows (see PROJECT.md)
    ticketTypes: (event.ticket_type ?? []) as any,
  });

  return {
    status: 200,
    data: {
      tiers: (tierRows ?? []) as EventPromotionTier[],
      currentPromotion: promo
        ? {
            ends_at: promo.ends_at,
            tierLabel: promo.event_promotion_tier?.duration_label ?? null,
          }
        : null,
      eligibility: {
        eventStatus: (event.status as string | null) ?? null,
        ended: derivedStatus === "ended",
        soldOut,
      },
    },
  };
}
