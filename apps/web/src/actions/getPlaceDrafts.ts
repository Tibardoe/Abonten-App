"use server";

import { createClient } from "@/config/supabase/server";

export type PlaceDraftListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  expiresAt: string;
  coverPublicId: string | null;
  coverVersion: string | null;
};

// List-page query: only list-display columns, never the full jsonb
// payload, bounded to this user's own non-expired place drafts. Mirrors
// getEventDrafts.ts.
export async function getPlaceDrafts() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: userError.message,
      data: [] as PlaceDraftListItem[],
    };
  }
  if (!user) {
    return {
      status: 401,
      message: "User not authenticated",
      data: [] as PlaceDraftListItem[],
    };
  }

  const { data: drafts, error: draftsError } = await supabase
    .from("drafts")
    .select("id, title, updated_at, expires_at")
    .eq("user_id", user.id)
    .eq("draft_type", "place")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  if (draftsError) {
    return {
      status: 500,
      message: draftsError.message,
      data: [] as PlaceDraftListItem[],
    };
  }
  if (!drafts || drafts.length === 0) {
    return { status: 200, message: "OK", data: [] as PlaceDraftListItem[] };
  }

  const draftIds = drafts.map((d) => d.id);

  const { data: placeDrafts, error: placeDraftsError } = await supabase
    .from("place_drafts")
    .select("draft_id, cover_public_id, cover_version")
    .in("draft_id", draftIds);

  if (placeDraftsError) {
    return {
      status: 500,
      message: placeDraftsError.message,
      data: [] as PlaceDraftListItem[],
    };
  }

  const coverByDraftId = new Map(
    (placeDrafts ?? []).map((pd) => [pd.draft_id, pd]),
  );

  const data: PlaceDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updated_at,
    expiresAt: d.expires_at,
    coverPublicId: coverByDraftId.get(d.id)?.cover_public_id ?? null,
    coverVersion: coverByDraftId.get(d.id)?.cover_version ?? null,
  }));

  return { status: 200, message: "OK", data };
}
