import { supabase } from "@/lib/supabase";

// Cross-device layer for event reminders. The user's chosen lead times are
// mirrored to the RLS-scoped `event_reminder` table (owner-only `FOR ALL`
// policy — direct CRUD, no Server Action / route, same class-A pattern as
// favourites). Each device still schedules its own local notifications from
// this; the row is the source of truth for *which* offsets were chosen.
//
// The FK is `event(id) ON DELETE CASCADE`, so a deleted event drops its
// reminder rows and the next reconcile on any device clears that device's
// local schedule.

/** The offsets stored server-side for one event, or null if there's no row. */
export async function pullServerReminder(
  eventId: string,
): Promise<number[] | null> {
  const { data, error } = await supabase
    .from("event_reminder")
    .select("offsets")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data ? ((data.offsets as number[]) ?? []) : null;
}

/** Offsets for every listed event id, in one query. Missing rows omitted. */
export async function pullServerReminders(
  eventIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (eventIds.length === 0) return out;
  const { data, error } = await supabase
    .from("event_reminder")
    .select("event_id, offsets")
    .in("event_id", eventIds);
  if (error) throw error;
  for (const row of data ?? []) {
    out.set(
      (row as { event_id: string }).event_id,
      (row as { offsets: number[] }).offsets ?? [],
    );
  }
  return out;
}

export async function pushServerReminder(
  userId: string,
  eventId: string,
  offsets: number[],
): Promise<void> {
  const { error } = await supabase.from("event_reminder").upsert(
    {
      user_id: userId,
      event_id: eventId,
      offsets,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,event_id" },
  );
  if (error) throw error;
}

export async function deleteServerReminder(eventId: string): Promise<void> {
  const { error } = await supabase
    .from("event_reminder")
    .delete()
    .eq("event_id", eventId);
  if (error) throw error;
}
