"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Lightweight companion to getUserAttendingEvents.ts -- returns just the
 * event ids the signed-in user holds a live ticket for (active or used),
 * instead of the full paginated ticket+event join. Used to drive the
 * "You're attending" indicator on discovery event cards, where fetching the
 * full ticket shape for every card would be far more than that badge needs.
 */
export default async function getUserAttendingEventIds(): Promise<{
  status: number;
  data: string[];
  message?: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 200, data: [] };
  }

  const { data, error } = await supabase
    .from("ticket")
    .select("ticket_type:ticket_type_id(event_id)")
    .eq("user_id", user.id)
    .in("status", ["active", "used"]);

  if (error) {
    console.error(`Error fetching user attending event ids: ${error.message}`);
    return { status: 500, data: [], message: "Something went wrong" };
  }

  const eventIds = new Set<string>();
  for (const row of data as unknown as {
    ticket_type: { event_id: string } | null;
  }[]) {
    if (row.ticket_type?.event_id) eventIds.add(row.ticket_type.event_id);
  }

  return { status: 200, data: Array.from(eventIds) };
}
