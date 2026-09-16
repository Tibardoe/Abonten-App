import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type Envelope, FAIL } from "./contentShared";

// What a creator may attach to a post: their own live events, plus events
// hosted at a place they own. Publishing re-checks all of this in
// content_post_publish(); this list only fills the composer's picker.

export type AttachableEvent = {
  id: string;
  title: string;
  eventCode: string;
  placeId: string | null;
  startsAt: string | null;
};

export async function listAttachableEventsCore(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<Envelope<AttachableEvent[]>> {
  const { data: places, error: placesError } = await supabase
    .from("place")
    .select("id")
    .eq("owner_id", userId)
    .limit(50);
  if (placesError) {
    logger.error(`listAttachableEventsCore places: ${placesError.message}`);
    return FAIL;
  }
  const placeIds = (places ?? []).map((p) => p.id);
  const filter =
    placeIds.length > 0
      ? `organizer_id.eq.${userId},place_id.in.(${placeIds.join(",")})`
      : `organizer_id.eq.${userId}`;

  const { data, error } = await supabase
    .from("event")
    .select(
      "id, title, event_code, place_id, moderation_state, event_occurrence(starts_at, ends_at)",
    )
    .or(filter)
    .eq("status", "published")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    logger.error(`listAttachableEventsCore events: ${error.message}`);
    return FAIL;
  }

  const now = Date.now();
  const events: AttachableEvent[] = [];
  for (const row of data ?? []) {
    if (
      row.moderation_state === "hidden" ||
      row.moderation_state === "removed"
    ) {
      continue;
    }
    const occurrences = (row.event_occurrence ?? []) as {
      starts_at: string | null;
      ends_at: string | null;
    }[];
    const upcoming = occurrences
      .filter((o) => !o.ends_at || Date.parse(o.ends_at) > now)
      .sort(
        (a, b) => Date.parse(a.starts_at ?? "") - Date.parse(b.starts_at ?? ""),
      );
    if (occurrences.length > 0 && upcoming.length === 0) continue;
    events.push({
      id: row.id,
      title: row.title,
      eventCode: row.event_code,
      placeId: row.place_id,
      startsAt: upcoming[0]?.starts_at ?? null,
    });
  }
  return { status: 200, data: events };
}
