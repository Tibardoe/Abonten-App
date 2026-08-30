export const dynamic = "force-dynamic";

import getEventHasConfirmedParticipation from "@/actions/getEventHasConfirmedParticipation";
import { getEventPromotionTiers } from "@/actions/getEventPromotionTiers";
import { createClient } from "@/config/supabase/server";
import ManageEventView from "@/events/organisms/ManageEventView";
import { getEventStatus } from "@abonten/core/eventStatus";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components

// Server Component ownership gate for an event's management page — mirrors
// manage/places/[placeId]/page.tsx exactly: fetches the event (any status)
// and checks organizer_id against the signed-in user inline, same
// "fetch-then-compare" shape getEventForEdit.ts's
// `.eq("organizer_id", user.id)` uses, just done here directly since a
// management page (not a modal/action) is the one place this check belongs
// in the page itself.
export default async function page({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        Sign in to manage this event.
      </p>
    );
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select(
      "*, event_occurrence(id, starts_at, ends_at), ticket_type(id, type, price, quantity, currency)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return (
      <p className="p-8 text-center text-muted-foreground">Event not found.</p>
    );
  }

  if (event.organizer_id !== user.id) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        You're not authorized to manage this event.
      </p>
    );
  }

  const [
    tiersResponse,
    { data: activePromotionRaw },
    participationResponse,
    { count: attendeeCount },
  ] = await Promise.all([
    getEventPromotionTiers(),
    // "Is this event currently featured via a paid promotion" is always
    // computed from ends_at > now(), never stored — same convention
    // manage/places/[placeId]/page.tsx's inline query uses for Places.
    supabase
      .from("event_promotion")
      .select("ends_at, event_promotion_tier(duration_label)")
      .eq("event_id", eventId)
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getEventHasConfirmedParticipation(eventId),
    // Lightweight count only — not the full Insights dashboard — just
    // enough to know whether a capacity-limited event is sold out, for the
    // Promotion tab's eligibility check (Part 18: a sold-out event
    // shouldn't be promotable).
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "attending"),
  ]);

  const promotionTiers =
    tiersResponse.status === 200 ? (tiersResponse.data ?? []) : [];
  // postgrest-js infers event_promotion_tier's embed as an array here (this
  // client has no generated Database types to tell it the join is
  // many-to-one) even though it's actually a single row at runtime — same
  // untyped-client situation manage/places/[placeId]/page.tsx works around.
  const activePromotion = activePromotionRaw as unknown as {
    ends_at: string;
    event_promotion_tier: { duration_label: string } | null;
  } | null;
  const currentPromotion = activePromotion
    ? {
        ends_at: activePromotion.ends_at,
        tier_label:
          activePromotion.event_promotion_tier?.duration_label ?? null,
      }
    : null;

  const hasConfirmedParticipation =
    participationResponse.status === 200 ? !!participationResponse.data : false;

  const derivedStatus = getEventStatus(
    event.starts_at,
    event.ends_at,
    event.event_occurrence ?? [],
  );

  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: attendeeCount ?? 0,
    ticketTypes: event.ticket_type ?? [],
  });

  return (
    <ManageEventView
      event={event}
      hasConfirmedParticipation={hasConfirmedParticipation}
      promotionTiers={promotionTiers}
      currentPromotion={currentPromotion}
      derivedStatus={derivedStatus}
      soldOut={soldOut}
    />
  );
}
