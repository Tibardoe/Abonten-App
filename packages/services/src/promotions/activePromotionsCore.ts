import { logger } from "@abonten/core/logger";
import type {
  ActivePromotionState,
  ActivePromotionSummary,
} from "@abonten/types/promotionSummaryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

export type { ActivePromotionState, ActivePromotionSummary };

// Every promotion the signed-in person is paying for or has queued, across
// what they own: featured events, featured places and promoted Spotlights.
// The single source for the web Settings "Promotion Details" card
// (getUserActivePromotions) and the app's Settings › Overview
// (GET /api/mobile/account/promotions).
//
// Before this, mobile had no source at all (the Overview said "manage them
// on the web") and web ignored Spotlight promotions. A promotion is live
// while `ends_at` is in the future — nothing stores an "active" flag — so
// one that has expired, or a campaign that ended, was rejected, cancelled
// or refunded, is simply not listed.
//
// Reads use the service role with an explicit owner filter on every query
// (the promotion tables are server-write-only; this never depends on a
// client's RLS view of them).

type Envelope<T> = { status: number; message?: string; data?: T };

const STATE_ORDER: Record<ActivePromotionState, number> = {
  active: 0,
  scheduled: 1,
  in_review: 2,
  paused: 3,
};

/** Campaign statuses that are still running or will run. */
const OPEN_CAMPAIGN_STATUSES = [
  "payment_confirmed",
  "pending_review",
  "scheduled",
  "active",
  "paused",
] as const;

function campaignState(status: string): ActivePromotionState {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "scheduled") return "scheduled";
  // payment_confirmed / pending_review: paid, waiting on the review queue.
  return "in_review";
}

function caption(text: string | null | undefined): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Your Spotlight";
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export function sortActivePromotions(
  items: ActivePromotionSummary[],
): ActivePromotionSummary[] {
  return [...items].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      Date.parse(a.endsAt) - Date.parse(b.endsAt),
  );
}

export async function listActivePromotionsCore(
  supabase: ServiceRoleClient,
  userId: string,
  nowMs: number = Date.now(),
): Promise<Envelope<ActivePromotionSummary[]>> {
  const now = new Date(nowMs).toISOString();

  const [events, places, campaigns] = await Promise.all([
    supabase
      .from("event_promotion")
      .select(
        "starts_at, ends_at, event_promotion_tier(duration_label), event!inner(id, title, organizer_id)",
      )
      .eq("event.organizer_id", userId)
      .gt("ends_at", now),
    supabase
      .from("place_promotion")
      .select(
        "starts_at, ends_at, place_promotion_tier(duration_label), place!inner(id, name, owner_id)",
      )
      .eq("place.owner_id", userId)
      .gt("ends_at", now),
    supabase
      .from("content_campaign")
      .select("id, post_id, status, starts_at, ends_at, content_post(caption)")
      .eq("advertiser_id", userId)
      .in("status", [...OPEN_CAMPAIGN_STATUSES])
      .gt("ends_at", now),
  ]);

  const failed = events.error ?? places.error ?? campaigns.error;
  if (failed) {
    logger.error(`listActivePromotionsCore failed: ${failed.message}`);
    return { status: 500, message: "Couldn't load your promotions." };
  }

  type EventRow = {
    starts_at: string;
    ends_at: string;
    event_promotion_tier: { duration_label: string } | null;
    event: { id: string; title: string } | null;
  };
  type PlaceRow = {
    starts_at: string;
    ends_at: string;
    place_promotion_tier: { duration_label: string } | null;
    place: { id: string; name: string } | null;
  };
  type CampaignRow = {
    id: string;
    post_id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    content_post: { caption: string | null } | null;
  };

  const out: ActivePromotionSummary[] = [];
  for (const row of (events.data ?? []) as unknown as EventRow[]) {
    if (!row.event) continue;
    out.push({
      resourceType: "event",
      resourceId: row.event.id,
      campaignId: null,
      resourceName: row.event.title,
      tierLabel: row.event_promotion_tier?.duration_label ?? null,
      state: Date.parse(row.starts_at) > nowMs ? "scheduled" : "active",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    });
  }
  for (const row of (places.data ?? []) as unknown as PlaceRow[]) {
    if (!row.place) continue;
    out.push({
      resourceType: "place",
      resourceId: row.place.id,
      campaignId: null,
      resourceName: row.place.name,
      tierLabel: row.place_promotion_tier?.duration_label ?? null,
      state: Date.parse(row.starts_at) > nowMs ? "scheduled" : "active",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    });
  }
  for (const row of (campaigns.data ?? []) as unknown as CampaignRow[]) {
    out.push({
      resourceType: "spotlight",
      resourceId: row.post_id,
      campaignId: row.id,
      resourceName: caption(row.content_post?.caption),
      tierLabel: null,
      state: campaignState(row.status),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    });
  }

  return { status: 200, data: sortActivePromotions(out) };
}
