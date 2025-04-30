"use server";

import { createClient } from "@/config/supabase/server";

export async function getEventAttendanceCount(eventId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    return { status: 500, message: error.message };
  }

  return { status: 200, count: count };
}
