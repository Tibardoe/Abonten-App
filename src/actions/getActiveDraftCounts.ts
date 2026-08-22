"use server";

import { createClient } from "@/config/supabase/server";

export type ActiveDraftCounts = {
  event: number;
  review: number;
  place: number;
};

// Cheap, head-only count query (no rows fetched) — used for the "you have
// saved drafts" chooser before starting a new event, and could back a nav
// badge. Only counts non-expired drafts.
export async function getActiveDraftCounts(): Promise<{
  status: number;
  message: string;
  data: ActiveDraftCounts;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: 401,
      message: "User not authenticated",
      data: { event: 0, review: 0, place: 0 },
    };
  }

  const nowIso = new Date().toISOString();

  const [eventResult, reviewResult, placeResult] = await Promise.all([
    supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("draft_type", "event")
      .gt("expires_at", nowIso),
    supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("draft_type", "review")
      .gt("expires_at", nowIso),
    supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("draft_type", "place")
      .gt("expires_at", nowIso),
  ]);

  return {
    status: 200,
    message: "OK",
    data: {
      event: eventResult.count ?? 0,
      review: reviewResult.count ?? 0,
      place: placeResult.count ?? 0,
    },
  };
}
