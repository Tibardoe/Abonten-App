"use server";

import { createClient } from "@/config/supabase/server";

export type ReviewDraftListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  expiresAt: string;
  reviewedId: string;
  rating: number | null;
};

export async function getReviewDrafts() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: userError.message,
      data: [] as ReviewDraftListItem[],
    };
  }
  if (!user) {
    return {
      status: 401,
      message: "User not authenticated",
      data: [] as ReviewDraftListItem[],
    };
  }

  const { data: drafts, error: draftsError } = await supabase
    .from("drafts")
    .select("id, title, updated_at, expires_at")
    .eq("user_id", user.id)
    .eq("draft_type", "review")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  if (draftsError) {
    return {
      status: 500,
      message: draftsError.message,
      data: [] as ReviewDraftListItem[],
    };
  }
  if (!drafts || drafts.length === 0) {
    return { status: 200, message: "OK", data: [] as ReviewDraftListItem[] };
  }

  const draftIds = drafts.map((d) => d.id);

  const { data: reviewDrafts, error: reviewDraftsError } = await supabase
    .from("review_drafts")
    .select("draft_id, reviewed_id, rating")
    .in("draft_id", draftIds);

  if (reviewDraftsError) {
    return {
      status: 500,
      message: reviewDraftsError.message,
      data: [] as ReviewDraftListItem[],
    };
  }

  const detailByDraftId = new Map(
    (reviewDrafts ?? []).map((rd) => [rd.draft_id, rd]),
  );

  const data: ReviewDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updated_at,
    expiresAt: d.expires_at,
    reviewedId: detailByDraftId.get(d.id)?.reviewed_id ?? "",
    rating: detailByDraftId.get(d.id)?.rating ?? null,
  }));

  return { status: 200, message: "OK", data };
}
