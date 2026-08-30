"use server";

import { createClient } from "@/config/supabase/server";

export type EventDraftListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  expiresAt: string;
  flyerPublicId: string | null;
  flyerVersion: string | null;
};

// List-page query: only list-display columns, never the full jsonb
// payload, bounded to this user's own non-expired event drafts.
export async function getEventDrafts() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: userError.message,
      data: [] as EventDraftListItem[],
    };
  }
  if (!user) {
    return {
      status: 401,
      message: "User not authenticated",
      data: [] as EventDraftListItem[],
    };
  }

  const { data: drafts, error: draftsError } = await supabase
    .from("drafts")
    .select("id, title, updated_at, expires_at")
    .eq("user_id", user.id)
    .eq("draft_type", "event")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  if (draftsError) {
    return {
      status: 500,
      message: draftsError.message,
      data: [] as EventDraftListItem[],
    };
  }
  if (!drafts || drafts.length === 0) {
    return { status: 200, message: "OK", data: [] as EventDraftListItem[] };
  }

  const draftIds = drafts.map((d) => d.id);

  const { data: eventDrafts, error: eventDraftsError } = await supabase
    .from("event_drafts")
    .select("draft_id, flyer_public_id, flyer_version")
    .in("draft_id", draftIds);

  if (eventDraftsError) {
    return {
      status: 500,
      message: eventDraftsError.message,
      data: [] as EventDraftListItem[],
    };
  }

  const flyerByDraftId = new Map(
    (eventDrafts ?? []).map((ed) => [ed.draft_id, ed]),
  );

  const data: EventDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updated_at,
    expiresAt: d.expires_at,
    flyerPublicId: flyerByDraftId.get(d.id)?.flyer_public_id ?? null,
    flyerVersion: flyerByDraftId.get(d.id)?.flyer_version ?? null,
  }));

  return { status: 200, message: "OK", data };
}
