"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Fetches a single event scoped to the current user, for prefilling the
 * edit form. `.eq("organizer_id", user.id)` on the query itself (not a
 * fetch-then-compare in JS) is the same ownership pattern used by
 * deleteEvent.ts/cancelEvent.ts.
 */
export async function getEventForEdit(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: event, error } = await supabase
    .from("event")
    .select(
      `
      id,
      title,
      description,
      address,
      capacity,
      website_url,
      event_category,
      event_type,
      require_registration,
      featured,
      starts_at,
      ends_at,
      flyer_public_id,
      flyer_version,
      event_occurrence(id, starts_at, ends_at)
    `,
    )
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .single();

  if (error || !event) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  return { status: 200, data: event };
}
