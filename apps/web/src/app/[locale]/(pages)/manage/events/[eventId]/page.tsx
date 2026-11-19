export const dynamic = "force-dynamic";

import getEventHasConfirmedParticipation from "@/actions/getEventHasConfirmedParticipation";
import { getEventPromotionTiers } from "@/actions/getEventPromotionTiers";
import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import ManageEventView from "@/events/organisms/ManageEventView";
import SwitchToTeamPrompt from "@/teams/molecules/SwitchToTeamPrompt";
import {
  actingFor,
  managingTargetFor,
  readActingTeamId,
} from "@/utils/teamActor";
import { getEventStatus } from "@abonten/core/eventStatus";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { promotionDurationLabel } from "@abonten/core/promotionSummary";
import { groupPricingEnabledFor } from "@abonten/services/events/groupPricingAccess";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// The tab names what is being managed. RLS limits the read to rows this
// person may see; anyone else just gets the section's own title.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("manage");

  const { eventId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("event")
    .select("title")
    .eq("id", eventId)
    .maybeSingle();
  const name = data?.title;
  return { title: name ? t("manage", { name: name }) : t("manageEvent") };
}

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
  const t = await getTranslations("manage");
  const tc = await getTranslations("core");

  const { eventId } = await params;
  const supabase = await createClient();

  // Who is asking and the event are read together: the read is limited
  // by the visitor's own session, and nothing is shown until both checks
  // below pass.
  const [
    {
      data: { user },
    },
    { data: event, error: eventError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("event")
      .select(
        "*, event_occurrence(id, starts_at, ends_at), ticket_type(id, type, price, quantity, admits, currency, available_from, available_until), event_group_discount(min_tickets, percent_off)",
      )
      .eq("id", eventId)
      .maybeSingle(),
  ]);

  if (!user) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        {t("signInToManageThisEvent")}
      </p>
    );
  }

  if (eventError || !event) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        {t("eventNotFound")}
      </p>
    );
  }

  // Managing as a team: the event must be the team's, and the person's
  // role decides which tabs they get (ManageEventView).
  const actor = await actingFor(user.id, [
    "events.manage",
    "attendees.view",
    "checkin.scan",
    "money.view",
    "promotions.buy",
  ]);
  if (actor.error || event.organizer_id !== actor.accountId) {
    // Opened while managing as another account (a notice about a team's
    // event, say): offer to switch when it is the person's or a team's.
    const target = await managingTargetFor(user.id, event.organizer_id);
    const managing = actor.error
      ? await readActingTeamId()
      : actor.accountId === user.id
        ? null
        : actor.accountId;
    if (
      target &&
      (target.kind === "team" ? target.teamId : null) !== managing
    ) {
      return <SwitchToTeamPrompt target={target} />;
    }
    return (
      <p className="p-8 text-center text-muted-foreground">
        {t("youReNotAuthorizedToManage")}
      </p>
    );
  }
  // Door staff limited to some of the team's places: the events held there.
  if (
    actor.placeIds &&
    !(event.place_id && actor.placeIds.includes(event.place_id))
  ) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        {t("teamPlaceNotYours")}
      </p>
    );
  }

  const [
    tiersResponse,
    { data: activePromotionRaw },
    participationResponse,
    { count: attendeeCount },
    groupPricingEnabled,
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
    // shouldn't be promotable). Counted with the service role, after the
    // check above: a team member who buys features (Finance) does not read
    // the attendee list, and must not see a sold-out event as open.
    getSupabaseServiceClient()
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "attending"),
    // Group tickets and group prices are switched on per organizer.
    groupPricingEnabledFor(actor.accountId),
  ]);

  const promotionTiers =
    tiersResponse.status === 200 ? (tiersResponse.data ?? []) : [];
  // postgrest-js infers event_promotion_tier's embed as an array here even
  // though the relationship is many-to-one and a single row comes back at
  // runtime; narrowed once here (same as manage/places/[placeId]/page.tsx).
  const activePromotion = activePromotionRaw as unknown as {
    ends_at: string;
    event_promotion_tier: { duration_label: string } | null;
  } | null;
  const currentPromotion = activePromotion
    ? {
        ends_at: activePromotion.ends_at,
        tier_label: activePromotion.event_promotion_tier?.duration_label
          ? promotionDurationLabel(
              tc,
              activePromotion.event_promotion_tier.duration_label,
            )
          : null,
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
      event={{ ...event, group_pricing_enabled: groupPricingEnabled }}
      hasConfirmedParticipation={hasConfirmedParticipation}
      promotionTiers={promotionTiers}
      currentPromotion={currentPromotion}
      derivedStatus={derivedStatus}
      soldOut={soldOut}
      teamRole={actor.role}
    />
  );
}
