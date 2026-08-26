"use server";

import { createClient } from "@/config/supabase/server";

export type ActivePromotionSummary = {
  resourceType: "event" | "place";
  resourceId: string;
  resourceName: string;
  tierLabel: string | null;
  startsAt: string;
  endsAt: string;
};

type EventPromotionRow = {
  starts_at: string;
  ends_at: string;
  event_promotion_tier: { duration_label: string } | null;
  event: { id: string; title: string } | null;
};

type PlacePromotionRow = {
  starts_at: string;
  ends_at: string;
  place_promotion_tier: { duration_label: string } | null;
  place: { id: string; name: string } | null;
};

// Promotion is resource-specific (an Event or Place has a promotion, not the
// user) — see ManageEventPromotionSection.tsx / ManagePlacePromotionSection.tsx
// for the per-resource purchase flow. This action only aggregates currently-
// active promotions across every Event/Place the signed-in user owns, for the
// Settings "Promotion Details" summary that replaced the old Plan Details
// block. Same `ends_at > now()` "is it active" convention used everywhere
// else promotion state is checked — nothing is stored as an active/expired
// flag.
export async function getUserActivePromotions() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 401, message: "Not authenticated" };
  }

  const now = new Date().toISOString();

  const [eventPromotions, placePromotions] = await Promise.all([
    supabase
      .from("event_promotion")
      .select(
        "starts_at, ends_at, event_promotion_tier(duration_label), event!inner(id, title, organizer_id)",
      )
      .eq("event.organizer_id", user.id)
      .gt("ends_at", now)
      .order("ends_at", { ascending: false }),
    supabase
      .from("place_promotion")
      .select(
        "starts_at, ends_at, place_promotion_tier(duration_label), place!inner(id, name, owner_id)",
      )
      .eq("place.owner_id", user.id)
      .gt("ends_at", now)
      .order("ends_at", { ascending: false }),
  ]);

  if (eventPromotions.error || placePromotions.error) {
    console.log(
      `Error fetching user promotions: ${
        eventPromotions.error?.message ?? placePromotions.error?.message
      }`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const events: ActivePromotionSummary[] = (
    (eventPromotions.data ?? []) as unknown as EventPromotionRow[]
  ).flatMap((row) => {
    if (!row.event) return [];
    return [
      {
        resourceType: "event" as const,
        resourceId: row.event.id,
        resourceName: row.event.title,
        tierLabel: row.event_promotion_tier?.duration_label ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      },
    ];
  });

  const places: ActivePromotionSummary[] = (
    (placePromotions.data ?? []) as unknown as PlacePromotionRow[]
  ).flatMap((row) => {
    if (!row.place) return [];
    return [
      {
        resourceType: "place" as const,
        resourceId: row.place.id,
        resourceName: row.place.name,
        tierLabel: row.place_promotion_tier?.duration_label ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      },
    ];
  });

  const data = [...events, ...places].sort(
    (a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime(),
  );

  return { status: 200, data };
}
